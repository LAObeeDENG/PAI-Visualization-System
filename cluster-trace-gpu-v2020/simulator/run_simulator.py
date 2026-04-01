from simulator import Simulator
from utils import print_fn, ALLOC_POLICY_DICT, PREEMPT_POLICY_DICT
import os
import time
import logging
import argparse
from pathlib import Path

DATE = "%02d%02d" % (time.localtime().tm_mon, time.localtime().tm_mday)

CSV_FILE_PATH = Path(__file__).parent / 'traces/pai/'
DESCRIBE_FILE = None
CSV_FILE = 'pai_job_duration_estimate_100K.csv'

parser = argparse.ArgumentParser(description='Simulator.')
parser.add_argument("-r", "--arrival_rate", help="Arrival Rate", type=int, default=1000)
parser.add_argument("-n", "--num_jobs", help="Num of Jobs", type=int, default=9000)
parser.add_argument("-g", "--num_gpus", help="Num of GPUs", type=int, default=6500)
parser.add_argument("-p", "--repeat", help='Repeat', type=int, default=1)
parser.add_argument("-k", "--pack", dest='packing_policy', action='store_true')
parser.add_argument("-b", "--balance", dest='packing_policy', action='store_false')
parser.set_defaults(packing_policy=False)
args = parser.parse_args()
NUM_JOBS = args.num_jobs
ARRIVAL_RATE = args.arrival_rate
NUM_GPUS = args.num_gpus
REPEAT = args.repeat
#SORT_NODE_POLICY = 0 if args.packing_policy is True else 3

MAX_TIME = int(1e9)
VERBOSE = 0
LOG_LEVEL = logging.WARNING
NUM_NODES = 1
NUM_CPUS = round(23.22 * NUM_GPUS)
#HETERO = False
PATTERN = 0
GPU_TYPE_MATCHING = 0
EXPORT_JOB_STATS = False
EXPORT_CLUSTER_UTIL = False
RANDOM_SEED = 42
NUM_SPARE_NODE = 0
SORT_BY_JCT = True
LOG_DIR = Path(__file__).parent / 'logs'
# ===== 新增：从环境变量读取异构模式 =====
hetero_env = os.environ.get('HETERO', '0')
HETERO = (hetero_env == '1')

# ===== 从环境变量读取选中的算法列表 =====
selected_algos_env = os.environ.get('SELECTED_ALGOS', '')
if selected_algos_env:
    try:
        SELECTED_ALGOS = [int(x) for x in selected_algos_env.split(',') if x.strip()]
    except ValueError:
        SELECTED_ALGOS = [0, 1, 2, 4, 8]  # 解析失败则跑全部
else:
    SELECTED_ALGOS = [0, 1, 2, 4, 8]  # 默认跑全部

# ===== 新增：从环境变量读取打包策略 =====
# 原来靠命令行 -k/-b 参数，现在改为环境变量优先
packing_env = os.environ.get('PACKING_POLICY', '')
if packing_env == '1':
    SORT_NODE_POLICY = 0   # 打包：优先填满节点
else:
    SORT_NODE_POLICY = 3   # 负载均衡：优先分配到空闲节点（默认）

# ===== 新增：从环境变量读取预留策略 =====
gpu_matching_env = os.environ.get('GPU_TYPE_MATCHING', '')
try:
    GPU_TYPE_MATCHING = int(gpu_matching_env) if gpu_matching_env else 0
except ValueError:
    GPU_TYPE_MATCHING = 0

comments = '%dg_%dn_h%d_%dp_%dsn_%dgt-%dar-%dj-%dx-%dr' % (
    NUM_GPUS, NUM_NODES, HETERO, PATTERN, SORT_NODE_POLICY,
    GPU_TYPE_MATCHING, ARRIVAL_RATE, NUM_JOBS, REPEAT, RANDOM_SEED
)

log_time = int(time.time() % 100000)
if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR)

log_file = LOG_DIR / ("%s-%s-%s-%s.log" % (DATE, CSV_FILE, log_time, comments))
logging.basicConfig(level=LOG_LEVEL, format="%(message)s", filename=log_file, filemode='a')
describe_file = CSV_FILE_PATH / DESCRIBE_FILE if DESCRIBE_FILE is not None else None

results_dict = {}
num_jobs_dict = {}
avg_jct_dict = {}
makespan_dict = {}
wait_time_dict = {}
runtime_dict = {}

print("log_file: %s" % log_file)
print_str = "==========\n%d_Jobs_repeated_%d_times\nalloc,preempt,avg_jct,wait_time,makespan,jobs_done,runtime" % (NUM_JOBS, REPEAT)
print(print_str)
print_fn(print_str, level=2)

# ===== 只跑选中的算法 =====
for alloc_policy in SELECTED_ALGOS:
    for preempt_policy in [2]:
        key = (alloc_policy, preempt_policy)
        print_key = "(%-4s,%4s)" % (ALLOC_POLICY_DICT.get(key[0]), PREEMPT_POLICY_DICT.get(key[1]))

        start_time = time.time()
        print_fn("\n###### %s ######" % print_key)

        simulator = Simulator(
            csv_file=CSV_FILE_PATH / CSV_FILE,
            alloc_policy=alloc_policy,
            preempt_policy=preempt_policy,
            sort_node_policy=SORT_NODE_POLICY,
            num_nodes=NUM_NODES,
            random_seed=RANDOM_SEED,
            max_time=MAX_TIME,
            num_spare_node=NUM_SPARE_NODE,
            pattern=PATTERN,
            hetero=HETERO,
            num_gpus=NUM_GPUS,
            num_cpus=NUM_CPUS,
            describe_file=describe_file,
            log_file=log_file,
            export_job_stats=EXPORT_JOB_STATS,
            export_cluster_util=EXPORT_CLUSTER_UTIL,
            arrival_rate=ARRIVAL_RATE,
            num_jobs_limit=NUM_JOBS,
            gpu_type_matching=GPU_TYPE_MATCHING,
            verbose=VERBOSE)
        results = simulator.simulator_go(repeat=REPEAT)

        num_jobs, avg_jct, makespan, wait_time = 0, 0, 0, 0
        for item in results:
            num_jobs += item[0]
            avg_jct += item[1]
            wait_time += item[2]
            makespan += item[3]

        results_dict[key] = results
        num_jobs_dict[key] = num_jobs
        avg_jct_dict[key] = avg_jct / REPEAT
        makespan_dict[key] = makespan / REPEAT
        wait_time_dict[key] = wait_time / REPEAT
        runtime_dict[key] = time.time() - start_time

        print_str = "%s,%.2f,%.2f,%.0f,%d,%.2f" % (
            print_key, avg_jct_dict[key], wait_time_dict[key],
            makespan_dict[key], num_jobs_dict[key], runtime_dict[key]
        )
        print(print_str)
        print_fn(print_str, level=2)

if SORT_BY_JCT:
    print("\n# Sort by JCT")
    print_fn("\n# Sort by JCT\nalloc,preempt,avg_jct,wait_time,makespan,jobs_done,runtime", level=2)
    items = sorted(avg_jct_dict.items(), key=lambda d: d[1])
else:
    print("\n# Summary")
    print_fn("\n# Summary\nalloc,preempt,avg_jct,wait_time,makespan,jobs_done,runtime", level=2)
    items = avg_jct_dict.items()

for item in items:
    key = item[0]
    print_key = "(%-4s,%4s)" % (ALLOC_POLICY_DICT.get(key[0]), PREEMPT_POLICY_DICT.get(key[1]))
    print_str = "%s,%.2f,%.2f,%.0f,%d,%.2f" % (
        print_key, avg_jct_dict[key], wait_time_dict[key],
        makespan_dict[key], num_jobs_dict[key], runtime_dict[key]
    )
    print(print_str)
    print_fn(print_str, level=2)

print("\nlog_file: %s" % log_file)
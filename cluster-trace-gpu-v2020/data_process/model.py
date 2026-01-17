from sqlalchemy import Column, Integer, String, Float, ForeignKey, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

Base = declarative_base()

class Job(Base):
    __tablename__ = 'jobs'
    # job_name 是唯一标识，设为主键并加索引
    job_name = Column(String, primary_key=True, index=True)
    user = Column(String)
    itask_id = Column(String) # 注意：README里提到这个有时代表job_id

class Task(Base):
    __tablename__ = 'tasks'
    # Task 需要复合主键（job_name + task_name）
    id = Column(Integer, primary_key=True, autoincrement=True)
    job_name = Column(String, ForeignKey('jobs.job_name'), index=True)
    task_name = Column(String, index=True)
    task_type = Column(String)
    # 资源申请量
    plan_cpu = Column(Float)
    plan_gpu = Column(Float)
    plan_mem = Column(Float)

class Instance(Base):
    __tablename__ = 'instances'
    instance_name = Column(String, primary_key=True, index=True)
    job_name = Column(String, index=True)
    task_name = Column(String, index=True)
    worker_name = Column(String, index=True) # 关联 Sensor 的关键
    status = Column(String)
    start_time = Column(Integer)
    end_time = Column(Integer)

class MachineSpec(Base):
    __tablename__ = 'machine_spec'

    machine   = Column(String, primary_key=True)
    gpu_type  = Column(String)
    cap_cpu   = Column(Integer)
    cap_mem   = Column(Integer)
    cap_gpu   = Column(Integer)   # “物理卡数”

# 建立索引（保证查询秒开）
Index('idx_task_lookup', Task.job_name, Task.task_name)
Index('idx_instance_lookup', Instance.job_name, Instance.task_name)
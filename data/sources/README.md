# Raw open data (not in Git: too large)

Used to build `data/job_types.json` (see the `source` fields there). Download again with:

```bash
cd data/sources
curl -L -o summary.xlsx https://github.com/mlcommons/inference_results_v6.1/raw/refs/heads/main/summary.xlsx
curl -L -o pai_task_table.tar.gz https://aliopentrace.oss-cn-beijing.aliyuncs.com/v2020GPUTraces/pai_task_table.tar.gz
curl -L -o pai_group_tag_table.tar.gz https://aliopentrace.oss-cn-beijing.aliyuncs.com/v2020GPUTraces/pai_group_tag_table.tar.gz
tar -xzf pai_task_table.tar.gz && tar -xzf pai_group_tag_table.tar.gz
```

- MLPerf Inference v6.1 results summary (MLCommons): throughput only, no power measurements in this round.
- Alibaba GPU cluster trace 2020 (`cluster-trace-gpu-v2020`): task durations, GPU requests, arrival hours,
  workload tags. https://github.com/alibaba/clusterdata/tree/master/cluster-trace-gpu-v2020

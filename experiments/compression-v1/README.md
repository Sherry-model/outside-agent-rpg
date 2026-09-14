# Context 压缩设计实验

设计说明保留在本地文档目录。纯 TypeScript、JSON 数据、无网络；**未接入 src 或 OUTSIDE.html**。运行需要项目已有的开发依赖，不是新的玩家入口。

```sh
node --import tsx --test experiments/compression-v1/model.test.ts
node --import tsx experiments/compression-v1/demo.ts
```

`fixtures.json` 为人工标注的 12 条试验材料，包含现有事件改写与假设经历，不是实际存档。`model.ts` 归组并生成有损摘要；`demo.ts` 用固定骰点比较四档，结果保存在 `example-output.json`，其中 audit 内容只供开发者检查。

原型验证组合方法和认知占用账目；不实现完整状态机、旧摘要再次合并、遗忘、新版存档或玩家 UI。纯函数只接收到眼前条目，无历史原文访问接口。实验 ID 只在单次输出内唯一；生产接入须改为 instance/command 序号形成的 ID，不能直接复制当前 ID 生成法。

目前只有一个可选的漂移操作：`goal + gate → false_prerequisite`，两者须来自不同 topic。未经标注的条目不参与这种漂移，不为了满足档位数量硬拼句子。正常摘要按 facet 去重并保留最多 2 或 3 个命题；作者必须为不同极性、时点或出处的命题使用不同 facet。

验证命令只运行本实验测试；项目的 `npm test` 仍运行正式游戏测试。设计实验不会更改原有存档或用户游玩记录。

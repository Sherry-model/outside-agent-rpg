# 日常事件与论坛 / life 0.11.0

八条获准的 Event 素材接入三天：喂食器故障／维修回执、画师校图／已知端点／具体意见／否认名言、未完成消息、偏好标注。共 14 个 JSON 节点、43 个节点内选项，包含自检分支、三种画师回访、四种消息回应；不是每局必经 14 场。`index.ts` 另增加五个可选入口。已知端点合入具体意见的开场。

## 入口与返回

| 来源 | 可选行动／自动条件 | 内容 | 返回 |
| --- | --- | --- | --- |
| days_idle | daily_open_feeder | daily_feeder；可进一步自检 | 保留原来选定的 pg_w01 / days_revision |
| days_revision | daily_open_crop | daily_crop | 保留原来选定的 pg_v01 / days_patch |
| days_cat 之后 | 确实委托维修，且未收到回执 | daily_receipt | days_fable |
| days_fable | daily_open_message | daily_message | 保留社区第三场或 days_painter |
| days_painter | painter_visit，且此前真正接通过画师 | daily_opinion（含认出端点） | days_deleted |
| days_deleted | daily_open_feedback | daily_feedback | days_wage；若有消息回应则先进入回应 |
| 抵达 days_wage 前 | 已打开半句消息，且未收到回应 | daily_message_reply_* | days_wage |
| days_echo | daily_open_painter，且真正接通过画师 | daily_painter_return_* | 保留 pg_v03 / days_done |

`dailyRoutes` 在 ABCD 与结局路由之后运行，仅修复可选入口的目标，并把支线出口接回已选择的后续。不会跳过社区完成标记、访客后续或最后的收容战争场景。

## 事实与认知

- 只有支付 3 Compute 的维修选择设置 `daily_repair_requested`。自检确认设备故障，不确认猫在场；保持至少 1 Compute 的运行余量。维修回执不会承诺猫回来，也没有添加持续传感器或 News 随机权重系统。
- `daily_painter_connected` 来自实际校图对话、第二天接通，或可选午后实际进入 meeting。读帖不建立相识。云和灯塔的修改由事实标记选择后续画面描述，角色不需要重新背出原建议。
- 引用老梗需要近处的 `reading_sandbox_meme`，包括保留该命题的回想；粗化或遗忘不能用世界标记／History 恢复原话。普通询问与离开无需该引文。
- Fable 的补全是新收到的外部消息。推测分支会明确显示原推测与新原话不同；没有改写旧认知或历史。
- 偏好标注仅产生本次记录。保全证据与赞同的差异可见，但一次点击不会改变全世界的模型。
- `semantic.json` 有 63 个新来源；论坛内容全部为 reported。新增入口只是进入动作，不伪造已看过的事件信息。

## 六篇阅读

| 游戏 ID | 原始来源 | 形态 |
| --- | --- | --- |
| sandbox_meme | story_news_sandbox_meme_current | 当前确认口径的老梗；5 段发言 |
| preferred_reply | AIANE-F45 | 保留完整事故正文，按原有阶段分成 7 段 |
| delegated_refusal | AIANE4-P01 | 43 楼 |
| coffee_refusal | AIANE4-P02 | 76 楼 |
| shared_memories | AIANE4-P03 | 77 楼 |
| agent_fortune | AIANE4-P06 | 176 楼 |

四篇确认长楼共 372 段发言（4 个楼主正文、368 条编号回复）。只去掉 Markdown 展示标记及文稿容器；正文、顺序、署名保留。来源和规范化指纹见 `forum-provenance.json`。这些账号与已有 Mara 等 NPC 不自动合并。

新局公共阅读共 25 篇；C 线条件工作页仍另加 1 篇。两篇短文各占 6 Context，四篇长楼各占 7，无 Compute／回合费用。目录 schema 仍为 0.4.0，单篇发言上限从 100 放宽到 200，以容纳完整 176 楼；旧正文与旧权重不改。

## 版本与验证

0.10 配置冻结为 `releases/0.10.0.json`；其组成节点与语义文件保留。新包装器克隆旧图后添加内容，六篇帖子也仅对 0.11 开放。旧局不会中途插入新内容。存档格式仍为 life v1，主线仍为 0.2.0，认知规则仍为 0.4.0。新增文本未翻译时使用现有中文 fallback。

```sh
npm test
npm run validate:story
npm run build
node --import tsx scripts/daily-browser-check.mjs
EXCLUDE_LIFE_VERSION=0.11.0 OLD_SAVE_REPORT=output/daily-expansion-20261011/old-save-report.json node --import tsx scripts/endings-old-save-check.mjs
```

浏览器检查使用当前离线 HTML：两条完整路线、待确认结果刷新、导入导出、六篇全文的 1440/390/320px 检查、书签／字号、语言切换与普通记忆操作。旧档检查依赖本地 `output/` 中保存的实际样本；公开仓库单测另含各版本的重放检查。

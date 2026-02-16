# Claude Code 逆向了它自己，发现 agent 之间靠读写 JSON 文件聊天

> 作者：Jerome.Y. (@alterxyz4)
> 发布于：2026-02-12

前几天我对 Claude Code 的 Agent Teams 功能产生了好奇：当你让多个 AI agent 组成团队协作时，它们之间到底是怎么通信的？WebSocket？gRPC？某种进程间消息队列？

答案让我意外——它们读写磁盘上的 JSON 文件。就这样。

更有意思的是发现过程本身。我问 Claude Code "你的 teammate 功能具体怎么实现的"，它二话不说，自己派了几个 agent 去对自己的二进制文件跑 strings 命令，从 183MB 的 Bun 编译产物里扒出了函数名、代码片段和数据结构。然后我提醒它——你自己就有这个功能，为什么不直接用一下看看？于是它又创建了一个实验团队，spawn 了一个 teammate，在文件系统上观察了完整的通信过程。

也就是说：一个 AI 先逆向了自己的源码，然后又亲手验证了逆向结论。这篇文章是这个过程的整理。

## 一、先说结论

Claude Code 的团队系统建立在三个极其朴素的原语之上：

1. 文件系统消息队列 —— 每个 agent 有一个 inbox JSON 文件
2. AsyncLocalStorage —— Node.js 原生的异步上下文隔离
3. 共享任务列表 —— 每个任务一个 JSON 文件

没有消息中间件，没有数据库，没有网络通信。所有东西都是文件。

## 二、怎么发现的

Claude Code 是一个 Bun 编译的单体二进制文件，大约 183MB，装在这里：

```
~/.local/share/claude/versions/2.1.39
```

我问它 teammate 怎么实现的，它直接派 agent 对自己的二进制跑 strings——从编译产物里提取可读字符串。虽然变量名都被混淆了（比如 N$、i7、c8），但函数名和错误信息还在。

它找到了这些关键函数名：

```
injectUserMessageToTeammate   ← 把消息注入为 user message
readUnreadMessages            ← 读取未读消息
formatTeammateMessages        ← 格式化 teammate 消息
waitForTeammatesToBecomeIdle  ← 等待 teammate 空闲
isInProcessTeammate           ← 判断是否为进程内 teammate
```

还扒出了上下文管理的核心代码，用的是 Node.js 的 AsyncLocalStorage：

```javascript
var T7A = new AsyncLocalStorage();

function getTeammateContext() { return T7A.getStore(); }

function runWithTeammateContext(ctx, fn) { return T7A.run(ctx, fn); }
```

但逆向只能告诉你代码长什么样，不能告诉你运行时到底会在磁盘上留下什么痕迹。所以我让它做了一个更直接的事——

## 三、实验：创建一个团队，观察文件系统

接下来它直接调用 TeamCreate 创建了一个叫"探索实验"的团队，spawn 了一个 teammate，让它们互相发消息，然后一步步去磁盘上看发生了什么。

### 第一步：创建团队

调用 TeamCreate 后，两个目录同时出现：

```
~/.claude/teams/----/config.json    ← 团队配置
~/.claude/tasks/----/               ← 任务列表
```

（中文团队名被 sanitize 成了 "----"，所有非字母数字字符变成连字符。）

config.json 的内容很直白：

```json
{
  "name": "探索实验",
  "leadAgentId": "team-lead@探索实验",
  "members": [
    {
      "name": "team-lead",
      "model": "claude-opus-4-6",
      "backendType": "in-process"
    }
  ]
}
```

就是一个成员列表。团队的"存在"完全由这个文件定义。

### 第二步：创建任务

调用 TaskCreate，一个新文件出现：

```
~/.claude/tasks/----/1.json
```

内容：

```json
{
  "id": "1",
  "subject": "检查 inbox 文件是否出现",
  "status": "pending",
  "blocks": [],
  "blockedBy": []
}
```

每个任务就是一个编号递增的 JSON 文件。blockedBy 数组是唯一的依赖管理机制。

### 第三步：Spawn 一个 Teammate

它生成了一个叫 observer 的 teammate，让 observer 给 lead（也就是它自己）发消息。

spawn 后 config.json 立刻更新，多了一个成员：

```json
{
  "name": "observer",
  "agentType": "general-purpose",
  "model": "haiku",
  "color": "blue",
  "backendType": "in-process"
}
```

同时，一个新目录出现了：

```
~/.claude/teams/----/inboxes/
```

这就是通信的核心。

### 第四步：看 inbox

observer 发了消息后，去看 inboxes 目录：

```
inboxes/
└── team-lead.json
```

打开 team-lead.json：

```json
{
  "from": "observer",
  "text": "你好 lead，我是 observer，我已经启动了！",
  "summary": "Observer reporting in",
  "timestamp": "2026-02-12T09:21:46.491Z",
  "color": "blue",
  "read": true
}
```

就是一个 JSON 数组。每条消息追加到数组末尾。

注意这时候 inboxes/ 下只有 team-lead.json，没有 observer.json——因为还没有人给 observer 发过消息。

lead 给 observer 发了一条消息后，observer.json 才出现：

```
inboxes/
├── team-lead.json
└── observer.json
```

inbox 文件是按需创建的，不是预先分配的。

## 四、协议消息：JSON 套 JSON

普通对话消息的 text 字段是纯文本。但系统级的协议消息——比如空闲通知、关闭请求——是把 JSON 序列化成字符串塞进 text 字段的。

比如 observer 完成工作后自动发的空闲通知：

```json
{
  "from": "observer",
  "text": "{\"type\":\"idle_notification\",\"from\":\"observer\",\"idleReason\":\"available\"}",
  "timestamp": "...",
  "color": "blue",
  "read": true
}
```

text 字段里是一个 JSON 字符串。接收方需要先 parse text，检测 type 字段，然后分发处理。

完整的消息时间线（lead 的 inbox）：

- 消息 1: 普通 DM "你好 lead，我是 observer，我已经启动了！"
- 消息 2: 普通 DM "任务列表报告：当前共有 1 个任务..."
- 消息 3: 协议消息 idle_notification (idleReason: available)
- 消息 4: 协议消息 idle_notification (收到 lead 回复后又空闲了)
- 消息 5: 协议消息 shutdown_approved (批准关闭)

而 observer 的 inbox 里：

- 消息 1: 普通 DM 来自 lead 的测试消息
- 消息 2: 协议消息 shutdown_request (lead 请求关闭)

整个生命周期就在这两个 JSON 文件里。

## 五、消息是怎么被 agent 读到的

这是最关键的部分。

从二进制里提取到的函数名 `injectUserMessageToTeammate` 直接揭示了机制：teammate 的消息被注入为 user message。

也就是说，对于接收方 agent 来说，一条来自 teammate 的消息和一条来自人类用户的消息，在对话历史里的地位是一样的。区别只在于它会被某种格式包裹（具体的包裹模板没有在二进制中找到，可能是运行时拼接的）。

投递的时机也很关键：只在 conversation turn 之间。

一个 Claude API 调用 = 一个 turn。Agent 收到输入 → 思考 → 调用工具 → 返回结果，这是一个 turn。只有当一个 turn 完整结束后，系统才会去检查 inbox 里有没有新消息。

这意味着：如果一个 agent 正在执行一个很长的 turn（比如写了一大堆代码），期间收到的消息不会被实时处理。必须等当前 turn 跑完。

这个特性甚至导致了一个 bug（GitHub #24108）：在 tmux 模式下，新 spawn 的 teammate 启动后停在初始欢迎界面，从来没有过第一个 turn，所以永远不会开始轮询 inbox，导致整个 agent 卡死。

## 六、两种运行模式

Teammate 有两种 backendType：

- **in-process**：在主进程里用 AsyncLocalStorage 隔离上下文
- **tmux**：在独立的 tmux pane 里跑一个完全独立的进程

默认是 in-process。两者共用同样的 inbox 文件通信机制，区别在于：

- in-process 终止用 `AbortController.abort()`
- tmux 终止用 `process.exit()`
- in-process 性能更好，但一个 crash 可能影响主进程
- tmux 更隔离，但有上面说的轮询启动 bug

## 七、已知的坑

通过 GitHub issue 验证了几个已知问题，全部仍然 OPEN：

**#23620 —— Context compaction 杀死团队感知**

长任务跑着跑着，lead 的上下文窗口满了，触发自动压缩。压缩之后，lead 完全忘记了团队的存在。无法发消息，无法协调任务，就像团队凭空消失了。社区开发了 Cozempic 工具来缓解：在压缩后自动从 config.json 里读取团队状态并重新注入。但官方还没有 PostCompact hook。

**#25131 —— 灾难性的 agent 生命周期失败**

重复 spawn、mailbox polling 浪费、生命周期管理混乱。

**#24130 —— Auto memory 文件不支持并发**

多个 teammate 同时写 MEMORY.md 会互相覆盖。

**#24977 —— 任务完成通知淹没上下文**

每次 TaskUpdate 都会在 lead 的 context 里留痕，加速了 compaction 问题。

**#23629 —— 任务状态不同步**

团队层面的任务状态和各 agent 会话内的状态可能不一致。

## 八、文件系统作为消息队列

看到这你可能会想：这不就是个消息队列吗？

对。它就是在文件系统上实现了一个消息队列。而且实现得出奇地自然。

想想消息队列的核心抽象：生产者写入，消费者读取，消息持久化，支持多个独立的 channel。

| 概念 | 实现 |
|------|------|
| channel | `inboxes/team-lead.json` |
| enqueue | JSON 数组追加 |
| dequeue | `readUnreadMessages()` |
| ack | `"read": true` |

你不需要安装 RabbitMQ。不需要跑一个 Redis。不需要任何额外的进程。文件系统本身就是一个持久化存储，操作系统的文件 API 就是你的队列接口。

这个选择的魅力在于它几乎没有部署成本。Claude Code 是一个 CLI 工具，用户 npm install 一下就能用。如果通信依赖一个消息中间件，那用户还得装 Redis？还得启动一个 daemon？对于一个命令行工具来说这显然太重了。

而文件系统——每个操作系统都有，不需要安装，不需要配置，不需要端口，不需要权限。mkdir 和 writeFile 就是你所需要的全部。

这也带来了一个非常实用的副产品：完全的可观察性。你随时可以 cat 一个 inbox 文件看到所有消息历史。出了问题？ls 一下 teams 目录就知道当前状态。不需要专门的监控面板，不需要 log aggregator，文件系统本身就是你的调试工具。

当然，用文件系统做消息队列不是没有代价。它没有真正的原子性——两个进程同时写一个 inbox 可能出问题（虽然 in-process 模式下共用事件循环所以基本没事）。它没有实时推送——消费者必须主动轮询。它没有 backpressure——inbox 文件可以无限增长。

但这些"缺陷"在这个场景下都是可以接受的。agent 之间的消息量很小（一个团队通常就几十条消息），延迟要求很低（turn 之间轮询一次已经够了），并发也有限（一个团队通常 2-4 个 agent）。

在这些约束下，文件系统是一个极其合理的选择。它把复杂度推给了操作系统——一个比任何消息中间件都更成熟、更可靠的基础设施。

## 九、代价

朴素有朴素的代价。这套系统目前有几个结构性的限制：

- **没有实时性**：消息只能在 turn 间投递。agent 写代码写到一半收不到消息。
- **没有同步等待**：不能 `await teammate.confirm()`。你发了问题出去，agent 不会停下来等回复，它要么继续干别的，要么进入空闲。
- **没有上下文重置**：teammate 的 context window 只增不减，做完任务 A 再做任务 B，A 的所有残留信息都还在。直到触发压缩，而压缩是有损的。
- **并发安全基本靠君子协定**：.lock 文件存在但不是严格的互斥锁。

这就像多线程编程没有锁——你得自己非常小心地设计任务边界和依赖关系，否则就会出现竞态和不一致。

社区反复强调的一句话很到位：

> "你需要像一个好的 tech lead 一样管理你的 agent 团队。"

因为系统本身不会帮你兜底。

## 十、总结

Claude Code 的 Agent Teams 是一个非常早期但已经可用的多 agent 协作框架。

它做了一个我觉得很聪明的决定：不发明新东西。文件系统是最古老的"数据库"，JSON 是最通用的序列化格式，AsyncLocalStorage 是 Node.js 自带的隔离原语。把这三样东西组合起来，你就得到了一个多 agent 通信系统。没有什么是需要额外学习或安装的。

它最大的优势不是什么高级的编排能力，而是"你随时可以打开 `~/.claude/teams/` 看到一切"。每条消息、每个任务、每个成员的信息都在那里，plain text，随便看。可以说它把 observability 做到了极致——不是因为加了什么监控，而是因为根本没有什么东西是隐藏的。

它目前的局限也很明显。GitHub 上 context compaction 杀死团队感知（#23620）、agent 生命周期管理混乱（#25131）等 issue 全部 OPEN。这些不是小 bug，是架构层面的结构性挑战。

但作为一个 CLI 工具里的 multi-agent 系统，我觉得这个起点选得很对。先用最简单的方式跑起来，让真实用户去踩真实的坑，然后再决定哪些地方需要变复杂。比起一上来就搞一套精密的分布式消息系统，这种"先用文件凑合"的路径风险要小得多。

毕竟，文件系统这个东西，40 年了，还没挂过。

---

## 附：快速验证方法

想自己看看的话：

1. 在 Claude Code 里创建一个团队
2. 用 `ls -laR ~/.claude/teams/` 观察文件变化
3. Spawn 一个 teammate，让它给你发消息
4. `cat ~/.claude/teams/你的团队名/inboxes/team-lead.json`
5. 你会看到所有消息，包括协议消息

整个通信历史就在那几个 JSON 文件里。

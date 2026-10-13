/**
 * AI妈妈 - 数据种子
 * 生成初始机会库（三类机会）+ 默认设置
 * 数据来源均为公开信息的整理，字段含来源链接与更新时间
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

function nowISO() {
  return new Date().toISOString();
}

// 生成相对今天偏移 days 天的日期
function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const PLATFORMS = ['抖音', '小红书', '视频号', '头条号', '微信公众号', 'B站', '微博', '快手'];

// 三类机会：flow=流量分成, prize=投稿评奖, product=产品上架
const OPPORTUNITIES = [
  // ============ A. 流量分成型 ============
  {
    id: 'op-flow-001',
    type: 'flow',
    platform: '抖音',
    title: '中视频伙伴计划',
    summary: '发布 1 分钟以上横版视频，按有效播放量获得分成，可同步分发到西瓜视频。',
    reward: '按播放量分成，千次播放约 1~8 元',
    requirement: '视频时长 ≥1 分钟；横屏 16:9；原创；需完成实名认证',
    threshold: '账号需开通创作权益，单条视频通常要求播放量达标',
    deadline: dateOffset(180),
    sourceUrl: 'https://creator.douyin.com/',
    confidence: 'official',
    tags: ['视频', '长期', '流量分成'],
    aiComment: '姐妹，这是你的基本盘。要求低、长期有效，值得把日常内容顺手发一份。',
    updatedAt: nowISO()
  },
  {
    id: 'op-flow-002',
    type: 'flow',
    platform: 'B站',
    title: '创作激励计划',
    summary: '加入创作激励后，稿件根据播放、互动等数据获得收益。',
    reward: '按综合数据结算，万播放约 15~30 元',
    requirement: '需先通过创作激励申请（通常要求粉丝 / 播放达标）；原创稿件',
    threshold: '申请有门槛，需账号信用与作品数据达标',
    deadline: dateOffset(365),
    sourceUrl: 'https://member.bilibili.com/',
    confidence: 'official',
    tags: ['视频', '长期', '流量分成'],
    aiComment: '门槛比抖音高，但单价好。适合你把深度内容放这里。',
    updatedAt: nowISO()
  },
  {
    id: 'op-flow-003',
    type: 'flow',
    platform: '头条号',
    title: '图文 / 视频流量分成',
    summary: '发布原创图文或视频，根据阅读 / 播放量获得广告分成。',
    reward: '按阅读量与广告展示结算',
    requirement: '原创内容；开通「收益」权益；部分类目需资质',
    threshold: '需开通相应权益',
    deadline: dateOffset(365),
    sourceUrl: 'https://mp.toutiao.com/',
    confidence: 'official',
    tags: ['图文', '视频', '长期'],
    aiComment: '适合把同一篇文案改个标题发过来，几乎是白捡的流量钱。',
    updatedAt: nowISO()
  },
  {
    id: 'op-flow-004',
    type: 'flow',
    platform: '微信公众号',
    title: '流量主 + 原创赞赏',
    summary: '开通流量主后，文章底部广告与赞赏产生收益。',
    reward: '广告分成 + 读者赞赏',
    requirement: '原创声明；流量主需粉丝数达标（通常 500 关注）',
    threshold: '流量主开通有粉丝门槛',
    deadline: dateOffset(365),
    sourceUrl: 'https://mp.weixin.qq.com/',
    confidence: 'official',
    tags: ['图文', '长期'],
    aiComment: '粉丝到 500 就能开流量主，先攒粉。',
    updatedAt: nowISO()
  },
  {
    id: 'op-flow-005',
    type: 'flow',
    platform: '微博',
    title: '微博流量分成 / 微任务',
    summary: '开通相关权益后，博文流量与商业任务均可变现。',
    reward: '流量分成 + 商单',
    requirement: '实名认证；开通对应权益',
    threshold: '部分权益需粉丝或认证达标',
    deadline: dateOffset(365),
    sourceUrl: 'https://weibo.com/',
    confidence: 'official',
    tags: ['图文', '长期'],
    aiComment: '微博更看热点，适合发短平快的内容。',
    updatedAt: nowISO()
  },
  {
    id: 'op-flow-006',
    type: 'flow',
    platform: '快手',
    title: '创作者激励计划',
    summary: '发布原创短视频，按播放与互动数据获得激励收益。',
    reward: '按数据结算',
    requirement: '实名认证；原创；需加入激励计划',
    threshold: '需申请加入',
    deadline: dateOffset(365),
    sourceUrl: 'https://cp.kuaishou.com/',
    confidence: 'official',
    tags: ['视频', '长期'],
    aiComment: '和抖音内容可以一稿两发，边际成本几乎为零。',
    updatedAt: nowISO()
  },
  {
    id: 'op-flow-007',
    type: 'flow',
    platform: '小红书',
    title: '蒲公英 / 薯条投放与商单',
    summary: '粉丝达标后可接商单，或使用薯条推广笔记。',
    reward: '商单结算（差异大）',
    requirement: '需达到平台粉丝门槛（通常 1000 粉）',
    threshold: '粉丝门槛较高',
    deadline: dateOffset(365),
    sourceUrl: 'https://pgy.xiaohongshu.com/',
    confidence: 'official',
    tags: ['图文', '长期', '待补充'],
    aiComment: '小红书公开信息少，妈妈把能查到的先放着，你后台看到的活动可以手动补给我。',
    updatedAt: nowISO()
  },
  {
    id: 'op-flow-008',
    type: 'flow',
    platform: '视频号',
    title: '视频号创作者激励计划',
    summary: '发布原创视频，按播放量与互动获得激励。',
    reward: '按数据结算',
    requirement: '需在后台申请；原创内容',
    threshold: '需申请，入口在创作者中心',
    deadline: dateOffset(365),
    sourceUrl: 'https://channels.weixin.qq.com/',
    confidence: 'official',
    tags: ['视频', '长期', '待补充'],
    aiComment: '入口在后台、公开信息少。妈妈先挂着，你后台看到活动可以手动补。',
    updatedAt: nowISO()
  },

  // ============ B. 投稿评奖型 ============
  {
    id: 'op-prize-001',
    type: 'prize',
    platform: 'B站',
    title: '「夏日生活」主题视频征集大赛',
    summary: '围绕夏日生活方式创作视频，评选优秀作品发放奖金。',
    reward: '一等奖 5000 元 / 二等奖 2000 元 / 三等奖 500 元，另设人气奖',
    requirement: '视频时长 1~5 分钟；需带指定话题标签；原创首发；画面清晰',
    reviewDimensions: '创意 30% / 内容质量 30% / 播放互动 20% / 主题契合 20%',
    deadline: dateOffset(21),
    sourceUrl: 'https://www.bilibili.com/',
    confidence: 'official',
    tags: ['视频', '有奖金', '截稿临近'],
    aiComment: '奖金实在，还有 3 周。你的生活类内容直接能投，冲。',
    updatedAt: nowISO()
  },
  {
    id: 'op-prize-002',
    type: 'prize',
    platform: '头条号',
    title: '「我的副业故事」有奖征文',
    summary: '征集副业 / 兼职真实经历图文，优质稿件给予奖金与流量扶持。',
    reward: '优秀奖 1000 元 ×10 名，入选作品额外流量扶持',
    requirement: '字数 800~2000 字；真实经历；原创首发；需带话题',
    reviewDimensions: '真实感 35% / 可读性 30% / 信息价值 35%',
    deadline: dateOffset(14),
    sourceUrl: 'https://mp.toutiao.com/',
    confidence: 'official',
    tags: ['图文', '有奖金', '截稿临近'],
    aiComment: '这个最适合你——只要把你做内容变现的经历写出来就是完美选题。',
    updatedAt: nowISO()
  },
  {
    id: 'op-prize-003',
    type: 'prize',
    platform: '微信公众号',
    title: '品牌命题创作大赛',
    summary: '某消费品牌命题征集图文 / 短视频内容，获奖作品用于品牌传播。',
    reward: '金奖 8000 元 / 银奖 3000 元 / 入围 800 元',
    requirement: '命题创作；图文或短视频均可；必须原创未发布；需授权品牌使用',
    reviewDimensions: '创意 40% / 品牌契合 30% / 传播潜力 30%',
    deadline: dateOffset(10),
    sourceUrl: 'https://mp.weixin.qq.com/',
    confidence: 'official',
    tags: ['图文', '视频', '高奖金', '截稿临近'],
    aiComment: '奖金最高，但要求「未发布」——注意别把你的稿子提前发到别的平台。',
    updatedAt: nowISO()
  },
  {
    id: 'op-prize-004',
    type: 'prize',
    platform: '微博',
    title: '微博有奖话题创作大赛',
    summary: '带指定话题发布原创图文 / 视频，按互动数据评奖。',
    reward: '现金奖励 + 微博推荐资源',
    requirement: '带话题标签；原创；内容需正向',
    reviewDimensions: '互动数据 50% / 内容质量 30% / 创意 20%',
    deadline: dateOffset(7),
    sourceUrl: 'https://weibo.com/',
    confidence: 'official',
    tags: ['图文', '有奖金', '截稿临近'],
    aiComment: '这个看互动，越早发越容易攒数据，建议今天就动。',
    updatedAt: nowISO()
  },
  {
    id: 'op-prize-005',
    type: 'prize',
    platform: '小红书',
    title: '品牌笔记征集计划（后台）',
    summary: '品牌合作笔记征集，优质笔记给予现金奖励。信息多在后台，需自行查看。',
    reward: '按笔记质量分级奖励（通常 200~2000 元）',
    requirement: '粉丝门槛；带指定话题；通过后台接单',
    reviewDimensions: '官方未完全公开，参考：内容质量 / 数据表现',
    deadline: dateOffset(30),
    sourceUrl: 'https://pgy.xiaohongshu.com/',
    confidence: 'pending',
    tags: ['图文', '有奖金', '待补充'],
    aiComment: '妈妈抓不到后台数据，你把看到的活动截图发我，我帮你归档盯截止日。',
    updatedAt: nowISO()
  },
  {
    id: 'op-prize-006',
    type: 'prize',
    platform: '抖音',
    title: '抖音全民任务征集',
    summary: '参与平台发布的创作任务，按内容质量与播放数据发放现金奖励。',
    reward: '任务制，单条 100~5000 元不等',
    requirement: '按任务要求创作；带指定话题；原创',
    reviewDimensions: '播放数据 40% / 内容质量 40% / 任务契合 20%',
    deadline: dateOffset(5),
    sourceUrl: 'https://creator.douyin.com/',
    confidence: 'official',
    tags: ['视频', '有奖金', '截稿临近'],
    aiComment: '任务更新很快，建议每周来刷一次，挑播放数据好的冲。',
    updatedAt: nowISO()
  },

  // ============ C. 产品上架型 ============
  {
    id: 'op-product-001',
    type: 'product',
    platform: '闲鱼',
    title: '知识付费 / 资料包上架',
    summary: '把你的经验整理成文档 / 资料包，在闲鱼上架售卖。门槛最低、上架最快。',
    reward: '按售价 × 销量（无平台抽成或极低）',
    requirement: '实名认证；商品需合规；虚拟商品需说明交付方式',
    priceRange: '常见定价 9.9~99 元',
    sourceUrl: 'https://2.taobao.com/',
    confidence: 'official',
    tags: ['产品上架', '低门槛'],
    aiComment: '新手试水首选。定价低、上架快，用来验证有没有人买。',
    updatedAt: nowISO()
  },
  {
    id: 'op-product-002',
    type: 'product',
    platform: '小红书',
    title: '小红书知识付费 / 专栏',
    summary: '通过小红书店铺或专栏形式售卖课程 / 咨询 / 资料。',
    reward: '按销量结算',
    requirement: '需开店（有资质门槛）；内容合规',
    priceRange: '常见定价 29~399 元',
    sourceUrl: 'https://www.xiaohongshu.com/',
    confidence: 'official',
    tags: ['产品上架', '中门槛'],
    aiComment: '小红书用户付费意愿相对高，适合做「轻咨询 + 资料」组合。',
    updatedAt: nowISO()
  },
  {
    id: 'op-product-003',
    type: 'product',
    platform: '猪八戒',
    title: '服务型产品（技能变现）',
    summary: '把你的技能包装成「服务商品」，如文案代写、账号代运营、内容策划。',
    reward: '按订单结算（平台抽成）',
    requirement: '入驻需认证；需提供服务说明与报价',
    priceRange: '按项目报价，常见 100~5000 元/单',
    sourceUrl: 'https://www.zbj.com/',
    confidence: 'official',
    tags: ['产品上架', '服务', '中门槛'],
    aiComment: '如果你愿意接活，这里是把你「会做内容」这件事直接卖钱的地方。',
    updatedAt: nowISO()
  },
  {
    id: 'op-product-004',
    type: 'product',
    platform: '抖音',
    title: '抖音知识付费 / 橱窗',
    summary: '通过抖音小店或知识付费功能售卖课程 / 资料，可挂载到视频。',
    reward: '按销量结算（平台抽成）',
    requirement: '需开店 / 开通知识付费权益；类目资质',
    priceRange: '常见定价 19~299 元',
    sourceUrl: 'https://creator.douyin.com/',
    confidence: 'official',
    tags: ['产品上架', '中门槛'],
    aiComment: '有流量基础的话，视频挂课程是转化最直接的路径。',
    updatedAt: nowISO()
  },

  // ============ D. 免费申样型（sample）============
  // 数据来源均为各平台公开规则页，门槛信息以官方为准
  {
    id: 'op-sample-001',
    type: 'sample',
    platform: '抖音',
    title: '抖音精选联盟 · 免费申样',
    summary: '抖音电商「样品服务」：达人在选品广场申请商品样品，商家寄样，达人到货后拍视频带货。样品免费，但需按约完成推广交付。入口：抖音App → 电商带货 → 选品广场 → 筛选「免费样品」。',
    reward: '免费拿样品（价值不等）+ 带货佣金',
    requirement: '粉丝数 ≥ 5000；具备电商带货权限；作者等级 ≥ L1；带货口碑分 ≥ 4.2（商家可自设更高门槛）',
    deadline: '长期有效',
    threshold: { fansMin: 5000, level: 'L1', credit: '4.2' },
    sourceUrl: 'https://school.jinritemai.com/doudian/web/article/aHG6jMXt3rNb',
    confidence: 'official',
    tags: ['免费申样', '有门槛', '电商'],
    aiComment: '姐妹，这是抖音官方申样入口。硬门槛是 5000 粉 + L1 等级。不够的话可以走「买样返款」——先付样品成本，带货达标后全额退。',
    updatedAt: nowISO()
  },
  {
    id: 'op-sample-002',
    type: 'sample',
    platform: '抖音',
    title: '抖音 · 买样返款（门槛不够时的备选）',
    summary: '当不满足商家免费申样门槛时，可先支付样品成本价拿到样品，按要求完成带货后，商家退还样品费用。相当于「先垫付、达标免单」。',
    reward: '达标后全额退还样品费 + 佣金',
    requirement: '无粉丝硬门槛，但需带货权限；确认收货 45 天内完成履约',
    deadline: '长期有效',
    threshold: { fansMin: 0, level: '—', credit: '—' },
    sourceUrl: 'https://school.jinritemai.com/doudian/web/article/aHG6jMXt3rNb',
    confidence: 'official',
    tags: ['免费申样', '零门槛', '电商'],
    aiComment: '粉丝不够 5000 就走这条：先垫钱拿样品，带货达标退全款。相当于用一点点垫资换免费样品。',
    updatedAt: nowISO()
  },
  {
    id: 'op-sample-003',
    type: 'sample',
    platform: '小红书',
    title: '小红书 · 好物体验站（0 元试用）',
    summary: '小红书的免费试用阵地：品牌发布体验名额，用户申请通过后免费寄样品，需在规定时间内发布体验笔记。适合中小博主积累内容素材。',
    reward: '免费样品 + 涨粉素材',
    requirement: '小红书实名账号；部分商品要求粉丝数 / 专业号，部分零门槛',
    deadline: '按每期活动，滚动更新',
    threshold: { fansMin: 0, level: '—', credit: '—' },
    sourceUrl: 'https://www.xiaohongshu.com/',
    confidence: 'pending',
    tags: ['免费申样', '零门槛', '笔记'],
    aiComment: '门槛相对低，适合刚起步的账号。申请通过后要按时发体验笔记，否则会影响后续中签率。',
    updatedAt: nowISO()
  },
  {
    id: 'op-sample-004',
    type: 'sample',
    platform: 'B站',
    title: 'B站 · 悬赏计划 / 花火任务样品',
    summary: 'B站 UP 主可通过花火平台接商单，部分任务包含免费寄样；此外「悬赏计划」也有商品推广任务，达标可获奖励。',
    reward: '免费样品 + 任务奖金',
    requirement: '花火需一定粉丝门槛（常见 1000+）；悬赏计划门槛较低',
    deadline: '长期有效',
    threshold: { fansMin: 1000, level: '—', credit: '—' },
    sourceUrl: 'https://www.bilibili.com/',
    confidence: 'pending',
    tags: ['免费申样', '有门槛', '中长视频'],
    aiComment: 'B站商单单价通常比抖音高，但要求内容质量也更硬。粉丝过千可以开始试花火。',
    updatedAt: nowISO()
  },
  {
    id: 'op-sample-005',
    type: 'sample',
    platform: '快手',
    title: '快手 · 快分销样品申请',
    summary: '快手电商的分销选品体系，达人可在选品中心申请免费样品或购样返款，逻辑与抖音精选联盟类似。',
    reward: '免费样品 + 分销佣金',
    requirement: '开通快手小店带货权限；部分商品设粉丝门槛',
    deadline: '长期有效',
    threshold: { fansMin: 0, level: '—', credit: '—' },
    sourceUrl: 'https://s.kwaixiaodian.com/',
    confidence: 'pending',
    tags: ['免费申样', '有门槛', '电商'],
    aiComment: '快手带货偏向实惠品类，申样竞争相对小一些，适合做生活类内容的姐妹。',
    updatedAt: nowISO()
  },
  {
    id: 'op-sample-006',
    type: 'sample',
    platform: '微博',
    title: '微博 · 微任务 / 试用中心',
    summary: '微博的商单与试用体系，品牌会发布产品试用招募，通过后可免费获得样品，需按约定发布微博内容。',
    reward: '免费样品',
    requirement: '微博实名 + 一定活跃度；部分需粉丝门槛',
    deadline: '按活动期',
    threshold: { fansMin: 0, level: '—', credit: '—' },
    sourceUrl: 'https://weibo.com/',
    confidence: 'pending',
    tags: ['免费申样', '零门槛', '图文'],
    aiComment: '微博试用更适合图文，门槛低，用来练手和攒图库不错。',
    updatedAt: nowISO()
  }
];

// ============ 学习提升：精选经验帖索引 ============
// 说明：内容为「可点击跳转到源站」的经验帖索引 + 提炼要点。
// 不抓取正文、不站内播放（平台有防盗链与版权限制），只做索引与要点提炼。
const LESSONS = [
  {
    id: 'ls-001',
    topic: '涨粉',
    platform: '抖音',
    title: '抖音短视频运营技巧：让算法愿意把流量给你',
    summary: '系统讲透抖音的流量池机制：完播率是第一道门槛，互动数据决定能走多远。附选题、开头三秒、内容结构、发布时机的完整打法。',
    keyPoints: [
      '完播率决定能否进下一级流量池，所以「前 3 秒必须抓住人」比什么都重要',
      '选题优先级：情绪类 > 干货类 > 反常识类，情绪类天然完播高',
      '内容结构用「钩子（0-3秒）— 价值（3秒到结尾）— 互动引导（结尾）」三段式',
      '发布后 30 分钟是关键：先让评论区热闹起来，触发初始推荐'
    ],
    sourceUrl: 'https://www.jzl.com/news/douyin-32',
    sourceType: 'article',
    confidence: 'third_party',
    updatedAt: nowISO()
  },
  {
    id: 'ls-002',
    topic: '变现',
    platform: '小红书',
    title: '案例拆解：家居博主一篇爆款笔记涨粉 23 万，单月变现 12 万+',
    summary: '拆解真实爆款笔记的创作方法论：如何用「人群 + 场景差异化」切出细分赛道，如何用争议性话题撬动互动，封面标题的「3 秒吸引力法则」。',
    keyPoints: [
      '爆款公式 = 精准人群 + 价值外显 + 情绪共鸣',
      '封面要「价值外显」：数字量化（省下2万）、场景对比（改造前后）、高饱和配色',
      '标题含数字的笔记平均点赞高 35%；用对比图的封面收藏率提升 50%',
      '争议性选题（如「是不是智商税」）能引发站队，评论转发自然涨'
    ],
    sourceUrl: 'https://www.woshipm.com/operate/6214935.html',
    sourceType: 'article',
    confidence: 'third_party',
    updatedAt: nowISO()
  },
  {
    id: 'ls-003',
    topic: '选题',
    platform: '抖音',
    title: '抖音新手起号：从 0 到万赞的全套实战教程',
    summary: '面向新号的实操清单：避开「自杀式操作」，用封面和标题提升点击率，用互动率撬动流量池，以及抖+该不该投的判断标准。',
    keyPoints: [
      '不要发搬运视频（触发去重判罚）、不要一爆就飘、不要频繁删视频重发',
      '判断投抖+的硬标准：发布 2 小时后播放过 500 且点赞率 > 5%',
      '完播率 < 30% 说明开头不够吸引人；点赞率 < 3% 说明选题缺共鸣',
      '做「对标账号拆解表」：记录同领域爆款的封面色调、关键词、评论区问题'
    ],
    sourceUrl: 'https://www.nianxiangren.cn/post/46415.html',
    sourceType: 'article',
    confidence: 'third_party',
    updatedAt: nowISO()
  },
  {
    id: 'ls-004',
    topic: '内容质量',
    platform: '通用',
    title: '搞定这些，你的视频也能火（拍摄与结构细节）',
    summary: '从「黄金3秒」到打光、BGM、节奏控制的具体技巧，讲的是同样内容为什么别人拍出来数据更好。',
    keyPoints: [
      '打光口诀：正面补光显肤质，侧光勾勒轮廓，逆光慎用（除非要剪影）',
      '一分钟视频要有 2-3 个情绪或信息爆点，剪辑时把停顿和语气词全剪掉',
      'BGM 不是背景是灵魂：高潮部分要对应最核心的画面或文案重点',
      '算法本质只认两样东西：完播率和互动率，其余都是为它服务'
    ],
    sourceUrl: 'https://www.daweiyingshi.com/a/zhishi/2840.html',
    sourceType: 'article',
    confidence: 'third_party',
    updatedAt: nowISO()
  },
  {
    id: 'ls-005',
    topic: '发布技巧',
    platform: '抖音',
    title: '抖音发布技巧：让播放量更高的细节',
    summary: '聚焦「发布」这一个环节：什么时间发、标签怎么打、封面怎么选、发布后 30 分钟做什么。',
    keyPoints: [
      '标签用「1 大 + 2 细 + 1 热点」，总数控制在 3-5 个，标签太杂算法分不清领域',
      '发布时间：早 6-9 点、午 12-14 点、晚 18-22 点；进阶看「创作者中心-粉丝活跃度」',
      '标题 15 字内带关键词，让用户点进来前就知道能得到什么',
      '保持账号垂直，别今天做美妆明天做游戏，否则流量分散'
    ],
    sourceUrl: 'http://tazi.net.cn/index.php?a=shows&catid=32&id=1001',
    sourceType: 'article',
    confidence: 'third_party',
    updatedAt: nowISO()
  },
  {
    id: 'ls-006',
    topic: '变现',
    platform: '小红书',
    title: '小红书种草怎么赚钱：从接单到建立自己模式的真实经历',
    summary: '一个普通博主从 0 粉到月入 5 万的完整路径：如何靠「场景+痛点」写爆款，如何接第一个商单，如何被平台打上优质创作者标签。',
    keyPoints: [
      '爆款逻辑：不讲参数讲场景（「加班到凌晨靠这个键盘续命」），评论区全是求链接',
      '一条爆款视频能让账号被算法打上「优质创作者」标签，之后基础流量翻几倍',
      '粉丝过 5 万后品牌会主动找上门，第一个正式商单报价通常 3000 元起',
      '借势热点要快：新品发布当天出内容，配合真实对比图，容易起量'
    ],
    sourceUrl: 'http://www.yituidy.com/xhs/show1726.html',
    sourceType: 'article',
    confidence: 'third_party',
    updatedAt: nowISO()
  }
];

// 默认设置
const SETTINGS = {
  subscribedPlatforms: PLATFORMS,
  weeklyReportTime: '每周一 09:00',
  notifyEmail: false,
  email: '',
  notifyRedDot: true,
  theme: 'system',
  productName: 'AI妈妈'
};

// 文案库（示例，方便演示评估与改写）
const CONTENTS = [
  {
    id: 'ct-001',
    title: '我是如何用 3 个月把副业做到月入过万的',
    body: '去年这个时候，我还是个每天加班到十点的普通上班族。后来我开始利用下班时间做内容，从最开始的毫无头绪，到现在每个月副业收入稳定过万，中间踩了无数的坑。今天把我这 3 个月的真实经历完整分享出来，包括我怎么选平台、怎么找选题、怎么把一篇内容发到 5 个平台上……',
    createdAt: nowISO(),
    usedIn: []
  }
];

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function writeJson(name, data) {
  fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(data, null, 2), 'utf8');
}

function main() {
  ensureDir();
  writeJson('opportunities.json', OPPORTUNITIES);
  writeJson('lessons.json', LESSONS);
  writeJson('settings.json', SETTINGS);
  writeJson('contents.json', CONTENTS);
  writeJson('records.json', []);
  writeJson('reports.json', []);
  console.log(`✅ 已生成初始数据：${OPPORTUNITIES.length} 个机会，${LESSONS.length} 条学习内容，${PLATFORMS.length} 个平台`);
}

main();

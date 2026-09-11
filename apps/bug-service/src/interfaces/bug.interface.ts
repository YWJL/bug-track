/** Bug 状态。不做状态机校验，任意流转都允许，这里只约束取值范围 */
export const BUG_STATUSES = ['active', 'confirmed', 'resolved', 'closed', 'reopened'] as const;
export type BugStatus = (typeof BUG_STATUSES)[number];

/** Bug 严重程度 */
export const BUG_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type BugSeverity = (typeof BUG_SEVERITIES)[number];

/** 历史记录的动作类型 */
export const BUG_ACTIONS = [
  'create',
  'update_status',
  'assign',
  'cc',
  'attach',
  'comment',
] as const;
export type BugAction = (typeof BUG_ACTIONS)[number];

/**
 * 一条变更历史。
 *
 * from / to 的含义随 action 变化：
 * - create        : from = ''        , to = 初始状态
 * - update_status : from = 旧状态     , to = 新状态
 * - assign        : from = 旧指派人   , to = 新指派人（未指派为 ''）
 * - cc            : from = 变更前抄送快照(逗号分隔), to = 变更后快照
 * - attach        : from = ''        , to = 被附加的 fileId
 * - comment       : from = ''        , to = ''，正文放在 remark
 */
export interface HistoryItem {
  action: BugAction;
  from: string;
  to: string;
  operator: string;
  remark: string;
  at: string;
}

/** Bug 实体，对应 data/bugs/BUG-0001.txt 的内容 */
export interface Bug {
  /** 形如 BUG-0001 */
  id: string;
  title: string;
  description: string;
  status: BugStatus;
  severity: BugSeverity;
  /** 创建人 */
  creator: string;
  /** 当前指派人，未指派为 '' */
  assignee: string;
  /** 抄送人列表 */
  ccList: string[];
  /** 附件 ID 列表，元素是 file-service 的 FILE-xxxx */
  attachmentIds: string[];
  createdAt: string;
  updatedAt: string;
  /** 完整变更历史，按时间正序 */
  history: HistoryItem[];
}

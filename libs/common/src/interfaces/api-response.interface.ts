/** 统一 HTTP 响应格式 */
export interface ApiResponse<T> {
  /** 业务状态码，0 表示成功；失败时为对应的 HTTP 状态码 */
  code: number;
  /** 提示信息，成功固定为 'success' */
  message: string;
  /** 业务数据，失败时为 null */
  data: T | null;
}

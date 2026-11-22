export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_REGEX = /^\d{11}$/;
export const PASSWORD_MIN_LEN = 6;
export const AUTH_BASE = "/f/009";

export const AUTH_COPY = {
    productName: "评测平台",
    loginTitle: "欢迎回来",
    loginSubtitle: "登录以开始模型评测与评分图谱分析",
    registerTitle: "创建账户",
    registerSubtitle: "用于关联您的评测任务与模型注册",
    forgotTitle: "忘记密码",
    forgotSubtitle: "输入注册邮箱，获取重置说明",
    forgotSuccessTitle: "请查收重置信息",
} as const;

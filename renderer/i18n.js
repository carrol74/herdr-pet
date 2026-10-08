const PET_TRANSLATIONS = {
  en: {
    idle: "Idle", working: "Working", blocked: "Needs attention", done: "Done", unknown: "Unknown",
    offline: "Offline", empty: "No running agents", region: "Herdr agents and messages",
    pet: "Herdr pet", attention: "Agents needing attention", language: "Language", settings: "Settings",
    message: "Send message", focus: "Switch to this agent", to: "Send to",
    placeholder: "Write a prompt…", input: "Prompt", back: "Back", send: "Send",
    sending: "Sending…", submitting: "Submitting to Herdr…", submitted: "Submitted to Herdr",
    hint: "Enter: new line · Ctrl / ⌘ + Enter: send",
    recentOutput: "Recent terminal output", previewLoading: "Loading preview…", previewEmpty: "No recent output",
    previewUnavailable: "Preview unavailable", recording: "Recording", stopRecording: "Stop recording",
    voiceInput: "Voice input", cancelVoice: "Cancel", voiceCancelled: "Voice input cancelled. Your draft is preserved.", voicePreparing: "Preparing local voice input…",
    voicePermission: "Waiting for microphone permission…", voiceDownloading: "Downloading Whisper Base · 142 MiB",
    voiceLoading: "Loading local speech model…", voiceTranscribing: "Transcribing on this device…",
    voiceInserted: "Voice draft inserted. Review it before sending.", voiceLimit: "Up to 60 seconds · stays on this device",
    voicePermissionDenied: "Microphone permission was not granted.", voiceNoMicrophone: "No microphone is available.",
    voiceCaptureError: "Could not record audio. Check microphone access and your input device.",
    voiceDownloadError: "Could not download the model. Click the microphone to retry.",
    voiceModelError: "Could not load the model. Remove ggml-base.bin from the app's models directory and retry.",
    voiceTranscribeError: "Could not transcribe audio. Your typed draft is safe.", voiceNoSpeech: "No speech was detected.",
    agentCount: "agents", attentionSummary: "need attention", localVoice: "Local voice input · downloads a 142 MiB model on first use",
  },
  zh: {
    idle: "空闲", working: "工作中", blocked: "需要处理", done: "已完成", unknown: "未知",
    offline: "离线", empty: "没有运行中的 agent", region: "Herdr agent 状态与消息",
    pet: "Herdr 宠物", attention: "需要处理的 agent 数量", language: "语言", settings: "设置",
    message: "发送消息", focus: "切换到此 agent", to: "发送给",
    placeholder: "输入提示…", input: "提示内容", back: "返回", send: "发送",
    sending: "发送中…", submitting: "正在提交给 Herdr…", submitted: "已提交给 Herdr",
    hint: "Enter 换行 · Ctrl / ⌘ + Enter 发送",
    recentOutput: "最近终端输出", previewLoading: "正在读取预览…", previewEmpty: "暂无最近输出",
    previewUnavailable: "暂时无法读取预览", recording: "录音中", stopRecording: "停止录音",
    voiceInput: "语音输入", cancelVoice: "取消", voiceCancelled: "语音输入已取消，草稿已保留。", voicePreparing: "正在准备本机语音输入…",
    voicePermission: "等待麦克风权限…", voiceDownloading: "正在下载 Whisper Base · 142 MiB",
    voiceLoading: "正在加载本机语音模型…", voiceTranscribing: "正在本机转写…",
    voiceInserted: "语音已加入草稿，请检查后发送。", voiceLimit: "最长 60 秒 · 仅在本机处理",
    voicePermissionDenied: "未取得麦克风权限。", voiceNoMicrophone: "没有可用的麦克风。",
    voiceCaptureError: "无法录音，请检查麦克风权限和输入设备。",
    voiceDownloadError: "模型下载失败，点击麦克风重试。",
    voiceModelError: "模型加载失败，请删除应用 models 目录中的 ggml-base.bin 后重试。",
    voiceTranscribeError: "语音转写失败，已输入的草稿仍然保留。", voiceNoSpeech: "没有检测到语音。",
    agentCount: "个 agent", attentionSummary: "个需要处理", localVoice: "本机语音输入 · 首次使用下载 142 MiB 模型",
  },
};

const PET_ENGLISH_ERRORS = {
  "提示内容不能为空": "The prompt cannot be empty.",
  "会话已切换，请返回列表重新选择 agent": "The session changed. Return to the list and select the agent again.",
  "没有可激活的 Herdr 客户端": "No Herdr client is available to activate.",
  "Herdr 客户端当前不可用": "The Herdr client is unavailable.",
  "当前终端暂不支持自动显示 Herdr 窗口": "This terminal does not support showing the Herdr window automatically.",
  "macOS 未允许 Herdr 控制 Ghostty": "macOS has not allowed Herdr to control Ghostty.",
  "找不到承载 Herdr 的 Ghostty 窗口": "The Ghostty window hosting Herdr was not found.",
  "Herdr 正在处理另一次窗口切换": "Herdr is already switching a window.",
  "显示 Herdr 窗口超时": "Showing the Herdr window timed out.",
  "无法显示 Herdr 窗口": "Unable to show the Herdr window.",
};

function petLanguage(saved, system) {
  return saved === "en" || saved === "zh" ? saved : system?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function petError(error, language) {
  const text = String(error);
  if (language !== "en") return text;
  const prefix = "已切换 agent，但无法显示 Herdr 窗口：";
  if (text.startsWith(prefix)) return `Agent selected, but its window could not be shown: ${petError(text.slice(prefix.length), language)}`;
  return PET_ENGLISH_ERRORS[text] || text;
}

if (typeof module !== "undefined") module.exports = { PET_TRANSLATIONS, petLanguage, petError };

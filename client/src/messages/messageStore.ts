import { computed, reactive, ref, type ComputedRef } from "vue";

export type MessageLevel = "info" | "success" | "warning" | "error";

export interface AppMessage {
  id: number;
  level: MessageLevel;
  text: string;
  timestamp: number;
}

export interface MessageLevelMeta {
  icon: string;
  label: string;
}

export const messageLevelMeta: Record<MessageLevel, MessageLevelMeta> = {
  info: { icon: "ℹ", label: "Info" },
  success: { icon: "✓", label: "Success" },
  warning: { icon: "⚠", label: "Warning" },
  error: { icon: "✕", label: "Error" },
};

const MAX_MESSAGES = 100;
const DUPLICATE_WINDOW_MS = 1000;
const MESSAGE_LEVEL_RANK: Record<MessageLevel, number> = {
  info: 0,
  success: 1,
  warning: 2,
  error: 3,
};

class MessageStore {
  pushMessage(level: MessageLevel, text: string): void {
    const timestamp = Date.now();
    const latest = this._messages[this._messages.length - 1];
    if (latest !== undefined
      && latest.text === text
      && timestamp - latest.timestamp <= DUPLICATE_WINDOW_MS) {
      if (MESSAGE_LEVEL_RANK[level] > MESSAGE_LEVEL_RANK[latest.level]) latest.level = level;
      return;
    }
    this._messages.push({
      id: this._nextMessageId++,
      level,
      text,
      timestamp,
    });
    this._capOverflow();
    this._unreadCount.value += 1;
  }

  clearMessages(): void {
    this._messages.splice(0, this._messages.length);
    this._unreadCount.value = 0;
  }

  markAllRead(): void {
    this._unreadCount.value = 0;
  }

  get messages(): readonly AppMessage[] {
    return this._messages;
  }

  private _capOverflow(): void {
    const overflow = this._messages.length - MAX_MESSAGES;
    if (overflow > 0) this._messages.splice(0, overflow);
  }

  readonly latest: ComputedRef<AppMessage | null> = computed(() =>
    this._messages.length > 0 ? this._messages[this._messages.length - 1] : null,
  );

  readonly unreadCount: ComputedRef<number> = computed(() => this._unreadCount.value);

  private readonly _messages = reactive<AppMessage[]>([]);
  private readonly _unreadCount = ref(0);
  private _nextMessageId = 1;
}

export const gMessageStore = new MessageStore();

export function pushMessage(level: MessageLevel, text: string): void {
  gMessageStore.pushMessage(level, text);
}

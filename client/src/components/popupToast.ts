import type { MessageLevel } from "../messages/messageStore";

export type PopupToastOptions = Readonly<{
  actionText?: string;
  isPersistent?: boolean;
  level?: MessageLevel;
}>;

export type PopupToastHandle = {
  show(text: string, options?: PopupToastOptions): void;
};
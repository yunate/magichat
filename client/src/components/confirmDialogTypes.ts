export type ConfirmDialogAction<TId extends string> = Readonly<{
  id: TId;
  label: string;
  appearance?: "default" | "primary";
  isDefault?: boolean;
}>;

export type ConfirmDialogOptions<TId extends string> = Readonly<{
  title: string;
  descriptions: readonly string[];
  actions: readonly ConfirmDialogAction<TId>[];
  cancelActionId: TId;
  details?: readonly Readonly<{ id: string; label: string }>[];
}>;

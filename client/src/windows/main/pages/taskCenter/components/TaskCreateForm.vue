<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import type { ComponentPublicInstance } from "vue";
import { MacroParser } from "../../../../../../../common/macroParser";
import {
  SCRIPT_TASK_KEY,
  SCRIPT_TYPES,
  type ScriptType,
} from "../../../../../../../common/tasks/scriptTaskDefinition";
import type { TaskCreateParam } from "../../../../../../../common/tasks/taskCreateParam";
import type { TaskTemplate } from "../../../../../../../common/tasks/taskTemplate";
import PopupToast from "../../../../../components/PopupToast.vue";
import PopupSelect from "../../../../../components/PopupSelect.vue";
import { TextEditComponent } from "../../../../../components/textEdit";
import type {
  TextEditParamGroup,
} from "../../../../../components/textEdit";

const props = defineProps<{
  template: TaskTemplate;
  isSubmitting: boolean;
  initialParams?: TaskCreateParam;
}>();

const emit = defineEmits<{
  submit: [params: TaskCreateParam];
  saveTemplate: [template: TaskTemplate];
  cloneTemplate: [template: TaskTemplate];
  deleteTemplate: [template: TaskTemplate];
  close: [];
}>();

interface FormState {
  scriptType: ScriptType;
  scriptContent: string;
  name: string;
  canResume: boolean;
}

const SCRIPT_TYPE_OPTIONS = SCRIPT_TYPES.map((type) => ({ value: type, label: type }));

const form = reactive<FormState>({
  scriptType: "powershell",
  scriptContent: "",
  name: "",
  canResume: false,
});

const variableGroups = ref<TextEditParamGroup[]>([createVariableGroup({})]);
const selectedVariableGroupId = ref<string>(variableGroups.value[0]?.id ?? "");
const popupToast = ref<{ show: (text: string) => void } | null>(null);

// Re-seed on source change: initialParams (Run new) wins over the template default; sidebar flow (no initialParams) seeds from the template.
watch(
  () => [props.template, props.initialParams] as const,
  () => {
    if (props.initialParams !== undefined) {
      seedFromParams(props.initialParams);
      return;
    }
    seedFromTemplate(props.template);
  },
  { immediate: true },
);

// The user script template this form was opened from, or null for the built-in template.
const editingTemplateId = computed<string | null>(() => {
  const template = props.template;
  if (template.builtin) return null;
  return template.id;
});

const validationError = computed<string>(() => {
  if (form.name.trim().length === 0) return "Task name is required.";
  if (form.scriptContent.trim().length === 0) return "Script content is required.";
  const variablesError = getVariablesError();
  if (variablesError.length > 0) return variablesError;
  return "";
});

const canSubmit = computed(() => validationError.value.length === 0 && !props.isSubmitting);

// Save-as-template is script-only and needs both a name and a body.
const canSaveTemplate = computed(
  () =>
    form.name.trim().length > 0 &&
    form.scriptContent.trim().length > 0 &&
    getVariablesError().length === 0,
);

function onSubmit(): void {
  if (!canSubmit.value) return;
  emit("submit", {
    type: SCRIPT_TASK_KEY,
    name: form.name.trim(),
    canResume: form.canResume,
    params: {
      scriptType: form.scriptType,
      scriptContent: form.scriptContent,
      variables: createVariablesRecord(),
    },
  });
}

function onSaveTemplate(): void {
  if (!canSaveTemplate.value) return;
  emit("saveTemplate", createTemplateFromForm());
}

function onCloneTemplate(): void {
  if (!canSaveTemplate.value || editingTemplateId.value === null) return;
  emit("cloneTemplate", createTemplateFromForm());
}

function createTemplateFromForm(): TaskTemplate {
  return {
    id: props.template.id,
    type: SCRIPT_TASK_KEY,
    name: form.name.trim(),
    builtin: false,
    template: {
      scriptType: form.scriptType,
      scriptContent: form.scriptContent,
      canResume: form.canResume,
      variables: createVariablesRecord(),
    },
  };
}

function seedVariableRows(variables: Readonly<Record<string, string>>): void {
  const group = createVariableGroup(variables);
  variableGroups.value = [group];
  selectedVariableGroupId.value = group.id;
}

function createVariableGroup(
  variables: Readonly<Record<string, string>>,
): TextEditParamGroup {
  const params = Object.entries(variables).map(([key, value]) => ({ key, value, enabled: true }));
  for (const key of MacroParser.extractKeys(form.scriptContent)) {
    if (!params.some((param) => param.key === key)) params.push({ key, value: "", enabled: true });
  }
  return {
    id: crypto.randomUUID(),
    name: "Task variables",
    sourceType: "Task",
    sourcePath: props.template.name,
    params,
  };
}

function updateVariableGroups(groups: TextEditParamGroup[]): void {
  variableGroups.value = groups;
}

function isValidVariableKey(key: string): boolean {
  try {
    MacroParser.replaceMacrosInText("", new Map([[key, ""]]));
    return true;
  } catch {
    return false;
  }
}

function getVariablesError(): string {
  const params = (variableGroups.value[0]?.params ?? []).filter((param) => param.enabled);
  if (params.some((param) => param.key.trim().length === 0)) {
    return "Variable key is required.";
  }
  if (params.some((param) => !isValidVariableKey(param.key))) {
    return "Variable keys must start with a letter or underscore and contain only letters, numbers, and underscores.";
  }
  const keys = params.map((param) => param.key);
  if (new Set(keys).size !== keys.length) return "Variable keys must be unique.";
  return "";
}

function createVariablesRecord(): Record<string, string> {
  const params = (variableGroups.value[0]?.params ?? []).filter((param) => param.enabled);
  return Object.fromEntries(params.map((param) => [param.key, param.value]));
}

function onDeleteTemplate(): void {
  // Guarded by the button's v-if; re-check so a stray call can't emit for a built-in.
  if (editingTemplateId.value === null) return;
  emit("deleteTemplate", props.template);
}

function onClose(): void {
  emit("close");
}

function onScriptTypeUpdate(value: string): void {
  form.scriptType = toScriptType(value);
}

function showTemplateSaved(name: string, operation: "updated" | "cloned"): void {
  popupToast.value?.show(`Template "${name}" ${operation}.`);
}

defineExpose({ showTemplateSaved });

// First focusable field; focused on open so keyboard users land inside the dialog, not the page behind.
const firstFieldRef = ref<HTMLElement | null>(null);

function setFirstFieldRef(el: Element | ComponentPublicInstance | null): void {
  firstFieldRef.value = el instanceof HTMLElement ? el : null;
}

// Modal is v-if-mounted, so the window listener is torn down on unmount; Escape closes.
function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") onClose();
}

function toScriptType(value: string | undefined): ScriptType {
  for (const type of SCRIPT_TYPES) {
    if (type === value) return type;
  }
  return "powershell";
}

// Sidebar flow: user-saved script templates carry a script body to prefill, built-ins start blank.
function seedFromTemplate(template: TaskTemplate): void {
  form.scriptType = toScriptType(template.template?.scriptType);
  form.scriptContent = template.template?.scriptContent ?? "";
  form.name = template.builtin ? "" : template.name;
  form.canResume = template.template?.canResume ?? false;
  seedVariableRows(template.template?.variables ?? {});
}

function seedFromParams(createParam: TaskCreateParam): void {
  if (createParam.type !== SCRIPT_TASK_KEY || createParam.params === undefined) {
    seedFromTemplate(props.template);
    return;
  }
  form.scriptType = createParam.params.scriptType;
  form.scriptContent = createParam.params.scriptContent;
  form.name = createParam.name;
  form.canResume = createParam.canResume;
  seedVariableRows(createParam.params.variables);
}

function removeKeydownListener(): void {
  window.removeEventListener("keydown", onKeydown);
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  // Wait for the dialog DOM to paint before focusing the first field.
  void nextTick(() => firstFieldRef.value?.focus());
});

onUnmounted(removeKeydownListener);
</script>

<template>
  <div class="task-form-overlay">
    <section class="task-form" role="dialog" aria-modal="true" aria-labelledby="task-form-title">
      <PopupToast ref="popupToast" />
      <header class="task-form__header">
        <h2 id="task-form-title" class="task-form__title">{{ props.template.name }}</h2>
        <button type="button" class="task-form__close" aria-label="Close" @click="onClose">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M3 3 13 13M13 3 3 13" />
          </svg>
        </button>
      </header>

      <form class="task-form__body" @submit.prevent="onSubmit">
        <div class="task-form__field">
          <label class="task-form__label" for="task-form-name">Name</label>
          <input
            id="task-form-name"
            :ref="setFirstFieldRef"
            v-model="form.name"
            class="task-form__input"
            type="text"
            placeholder="Task / template name"
          />
        </div>
        <div class="task-form__field">
          <span id="task-form-script-type-label" class="task-form__label">Interpreter</span>
          <div class="task-form__select">
            <PopupSelect
              :value="form.scriptType"
              :options="SCRIPT_TYPE_OPTIONS"
              accessible-label="Interpreter"
              labelled-by="task-form-script-type-label"
              @update-value="onScriptTypeUpdate"
            />
          </div>
        </div>
        <section class="task-form__script" aria-labelledby="task-form-script-title">
          <h3 id="task-form-script-title" class="task-form__label">Script content</h3>
          <div class="task-form__text-edit">
            <TextEditComponent
              :param-groups="variableGroups"
              :text="form.scriptContent"
              :selected-group-id="selectedVariableGroupId"
              :text-identity="selectedVariableGroupId"
              :is-script-macro-param-sync-enabled="true"
              :is-param-group-management-disabled="true"
              accessible-label="Script content and variables"
              @update-param-groups="updateVariableGroups"
              @update-text="form.scriptContent = $event"
            />
          </div>
        </section>
        <div class="task-form__field">
          <label class="task-form__check">
            <input v-model="form.canResume" type="checkbox" class="task-form__checkbox" />
            <span>Resume after restart</span>
          </label>
          <p class="task-form__hint">Automatically re-run this script after the server restarts.</p>
        </div>

        <p v-if="validationError.length > 0" class="task-form__error" role="alert">
          {{ validationError }}
        </p>

        <footer class="task-form__actions">
          <div class="task-form__actions-left">
            <button
              v-if="editingTemplateId !== null"
              type="button"
              class="task-form__btn task-form__btn--ghost"
              :disabled="!canSaveTemplate"
              @click="onCloneTemplate"
            >
              Clone
            </button>
            <button
              type="button"
              class="task-form__btn task-form__btn--ghost"
              :disabled="!canSaveTemplate"
              @click="onSaveTemplate"
            >
              {{ editingTemplateId !== null ? "Update template" : "Save as template" }}
            </button>
            <button
              v-if="editingTemplateId !== null"
              type="button"
              class="task-form__btn task-form__btn--danger"
              @click="onDeleteTemplate"
            >
              Delete template
            </button>
          </div>
          <div class="task-form__actions-right">
            <button type="button" class="task-form__btn task-form__btn--ghost" @click="onClose">
              Cancel
            </button>
            <button type="submit" class="task-form__btn task-form__btn--primary" :disabled="!canSubmit">
              {{ props.isSubmitting ? "Adding..." : "Add task" }}
            </button>
          </div>
        </footer>
      </form>
    </section>
  </div>
</template>

<style scoped>
.task-form-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  background: rgba(0, 0, 0, 0.5);
}

.task-form {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(1200px, 100%);
  height: min(900px, 100%);
  max-height: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.45);
}

.task-form__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex: none;
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.task-form__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
}

.task-form__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-1);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}

.task-form__close svg {
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  fill: none;
}

.task-form__close:hover {
  color: var(--color-text);
  background: var(--color-surface-raised);
}

.task-form__close:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.task-form__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-4);
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.task-form__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.task-form__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
}

.task-form__input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  color: var(--color-text);
  font-size: 14px;
}

.task-form__input:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.task-form__select {
  min-width: 0;
}

.task-form__script {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-1);
  min-height: 280px;
}

.task-form__script .task-form__label {
  margin: 0;
}

.task-form__text-edit {
  min-height: 0;
  display: flex;
  flex: 1;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.task-form__check {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 13px;
  color: var(--color-text);
  cursor: pointer;
}

.task-form__checkbox {
  width: 15px;
  height: 15px;
  accent-color: var(--color-primary);
  cursor: pointer;
}

.task-form__hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
}

.task-form__error {
  margin: 0;
  font-size: 13px;
  color: var(--color-danger);
}

.task-form__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.task-form__actions-right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-left: auto;
}

.task-form__actions-left {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.task-form__btn {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: filter 0.15s ease, background 0.15s ease;
}

.task-form__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.task-form__btn:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.task-form__btn--primary {
  border: 1px solid var(--color-primary);
  background: var(--color-primary);
  color: var(--color-bg);
}

.task-form__btn--primary:not(:disabled):hover {
  filter: brightness(1.1);
}

.task-form__btn--ghost {
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
}

.task-form__btn--ghost:not(:disabled):hover {
  background: var(--color-surface-raised);
}

.task-form__btn--danger {
  border: 1px solid var(--color-danger);
  background: transparent;
  color: var(--color-danger);
}

.task-form__btn--danger:not(:disabled):hover {
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
}
</style>

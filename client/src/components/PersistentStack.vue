<script setup lang="ts" generic="TEntry">
import { ref, shallowRef, watch } from "vue";

type Props = {
  entries: readonly TEntry[];
  activeKey: string | null;
  getEntryKey: (entry: TEntry) => string;
  deferDisplayUntilReady?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
  deferDisplayUntilReady: false,
});
defineSlots<{
  default(props: { entry: TEntry; isActive: boolean; notifyReady: () => void }): unknown;
}>();

const mountedKeys = shallowRef<ReadonlySet<string>>(new Set());
const readyKeys = shallowRef<ReadonlySet<string>>(new Set());
const renderedEntries = shallowRef<readonly TEntry[]>([]);
const displayedKey = ref<string | null>(null);

watch(
  [() => props.entries, () => props.activeKey],
  () => synchronizeEntries(),
  { immediate: true },
);

function synchronizeEntries(): void {
  const currentKeys = new Set(props.entries.map(props.getEntryKey));
  const previousDisplayedEntry = displayedKey.value === null
    ? undefined
    : renderedEntries.value.find((entry) => props.getEntryKey(entry) === displayedKey.value);
  const isActiveReady = props.activeKey !== null
    && (!props.deferDisplayUntilReady || readyKeys.value.has(props.activeKey));
  const shouldRetainDisplayed = !isActiveReady && previousDisplayedEntry !== undefined
    && !currentKeys.has(props.getEntryKey(previousDisplayedEntry));
  renderedEntries.value = shouldRetainDisplayed
    ? [...props.entries, previousDisplayedEntry]
    : props.entries;
  const renderedKeys = new Set(renderedEntries.value.map(props.getEntryKey));
  const activeKeys = props.activeKey === null ? [] : [props.activeKey];
  mountedKeys.value = new Set(
    [...mountedKeys.value, ...activeKeys].filter((key) => renderedKeys.has(key)),
  );
  readyKeys.value = new Set([...readyKeys.value].filter((key) => renderedKeys.has(key)));
  if (isActiveReady) {
    displayedKey.value = props.activeKey;
  } else if (displayedKey.value !== null && !renderedKeys.has(displayedKey.value)) {
    displayedKey.value = null;
  }
}

function notifyReady(key: string): void {
  readyKeys.value = new Set([...readyKeys.value, key]);
  if (props.activeKey !== key) return;
  displayedKey.value = key;
  synchronizeEntries();
}
</script>

<template>
  <div class="persistent-stack">
    <template v-for="entry in renderedEntries" :key="props.getEntryKey(entry)">
      <div
        v-if="mountedKeys.has(props.getEntryKey(entry))"
        class="persistent-stack__pane"
        :class="{ 'is-active': props.getEntryKey(entry) === displayedKey }"
        :inert="props.getEntryKey(entry) !== displayedKey"
        :aria-hidden="props.getEntryKey(entry) === displayedKey ? undefined : true"
      >
        <slot
          :entry="entry"
          :is-active="props.getEntryKey(entry) === props.activeKey"
          :notify-ready="() => notifyReady(props.getEntryKey(entry))"
        ></slot>
      </div>
    </template>
  </div>
</template>

<style scoped>
.persistent-stack {
  isolation: isolate;
  flex: 1;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template: minmax(0, 1fr) / minmax(0, 1fr);
}

.persistent-stack__pane {
  grid-area: 1 / 1;
  z-index: 0;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template: minmax(0, 1fr) / minmax(0, 1fr);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.persistent-stack__pane.is-active {
  z-index: 1;
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}
</style>

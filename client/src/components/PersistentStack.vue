<script setup lang="ts" generic="TEntry">
import { shallowRef, watch } from "vue";

type Props = {
  entries: readonly TEntry[];
  activeKey: string | null;
  getEntryKey: (entry: TEntry) => string;
};

const props = defineProps<Props>();
defineSlots<{
  default(props: { entry: TEntry; isActive: boolean }): unknown;
}>();

const mountedKeys = shallowRef<ReadonlySet<string>>(new Set());

watch(
  [() => props.entries, () => props.activeKey],
  ([entries, activeKey]) => {
    const entryKeys = entries.map(props.getEntryKey);
    const availableKeys = new Set(entryKeys);
    const nextKeys = new Set(
      [...mountedKeys.value].filter((entryKey) => availableKeys.has(entryKey)),
    );
    if (activeKey !== null && availableKeys.has(activeKey)) nextKeys.add(activeKey);
    mountedKeys.value = nextKeys;
  },
  { immediate: true },
);
</script>

<template>
  <div class="persistent-stack">
    <template v-for="entry in props.entries" :key="props.getEntryKey(entry)">
      <div
        v-if="mountedKeys.has(props.getEntryKey(entry))"
        class="persistent-stack__pane"
        :class="{ 'is-active': props.getEntryKey(entry) === props.activeKey }"
        :inert="props.getEntryKey(entry) !== props.activeKey"
        :aria-hidden="props.getEntryKey(entry) === props.activeKey ? undefined : true"
      >
        <slot
          :entry="entry"
          :is-active="props.getEntryKey(entry) === props.activeKey"
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

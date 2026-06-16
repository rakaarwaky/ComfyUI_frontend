<template>
  <div
    class="flex size-full items-center px-1"
    data-testid="colors"
    @pointerdown.stop
  >
    <PaletteSwatchRow v-model="modelValue" :max="MAX_COLORS" />
  </div>
</template>

<script setup lang="ts">
import PaletteSwatchRow from './PaletteSwatchRow.vue'

const MAX_COLORS = 16

const modelValue = defineModel<string[]>({ default: () => [] })
</script>

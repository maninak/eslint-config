<script setup lang="ts">
import { ref } from 'vue'

const el = ref<HTMLDivElement>()

defineExpose({ el })
</script>

<template>
  <div ref="el">content</div>
</template>

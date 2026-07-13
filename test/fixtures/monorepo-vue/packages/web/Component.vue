<script setup lang="ts">
// Runtime (non-type-based) defineProps: vue/define-props-declaration must fire, proving the
// Vue config activated even though `vue` is declared in this sub-package, not the root.
defineProps({ label: { type: String, required: true } })
</script>

<template>
  <button>{{ label }}</button>
  <!-- CustomWidget is undefined; under Nuxt vue/no-undef-components is off, so no report -->
  <CustomWidget />
  <p title="a deliberately long unwrappable attribute value that runs well past the ninety-five column print width for sure">{{ label }}</p>
</template>

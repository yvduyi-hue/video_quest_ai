<template>
  <a class="vq-link" @click="$emit('click')"><slot /></a>
</template>

<script setup lang="ts">
defineEmits(['click'])
</script>

<style scoped>
.vq-link {
  color: var(--vq-primary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.vq-link:hover {
  text-decoration: underline;
}
</style>

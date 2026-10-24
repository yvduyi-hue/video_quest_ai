<template>
  <div class="user-pill">
    <img v-if="avatar" class="avatar" :src="avatar" alt="avatar" />
    <div v-else class="avatar avatar--fallback">{{ name.charAt(0) }}</div>
    <div class="user-info">
      <div class="username">{{ name }}</div>
      <div class="role">{{ role }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    avatar?: string
    name: string
    role?: string
  }>(),
  { avatar: '', role: '' }
)
</script>

<style scoped>
.user-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
}
.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
}
.avatar--fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--vq-primary-light);
  color: var(--vq-primary);
  font-size: 14px;
  font-weight: 600;
}
.username {
  font-size: 14px;
  color: var(--vq-text-title);
}
.role {
  font-size: 12px;
  color: var(--vq-text-secondary);
}
</style>

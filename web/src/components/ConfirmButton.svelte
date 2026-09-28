<script>
  // Dugme koje traži drugi klik za potvrdu, bez iskačućih prozora.
  let {
    label,
    confirmLabel = 'Klikni ponovo za potvrdu',
    onConfirm,
    disabled = false,
    kind = 'quiet',
  } = $props();
  let armed = $state(false);
  let timer;

  function click() {
    if (!armed) {
      armed = true;
      timer = setTimeout(() => (armed = false), 3500);
      return;
    }
    clearTimeout(timer);
    armed = false;
    onConfirm();
  }
</script>

<button type="button" class="btn {kind}" class:danger={armed} {disabled} onclick={click}>
  {armed ? confirmLabel : label}
</button>

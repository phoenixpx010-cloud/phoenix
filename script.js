const toast = document.getElementById("toast");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

document.getElementById("newOrderBtn").addEventListener("click", () => {
  window.location.href = "pedido.html";
});

document.getElementById("viewOrderBtn").addEventListener("click", () => {
  window.location.href = "pedidos.html";
});

document.getElementById("loginBtn").addEventListener("click", () => {
  window.location.href = "login.html";
});

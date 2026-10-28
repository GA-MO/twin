export function confirmDialog({ title, body, confirmLabel }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "backdrop open";
    backdrop.innerHTML = `<div class="dialog" role="dialog"><h2></h2><p></p><div class="actions"><button data-act="cancel">Cancel</button><button class="danger" data-act="ok"></button></div></div>`;
    backdrop.querySelector("h2").textContent = title;
    backdrop.querySelector("p").textContent = body;
    backdrop.querySelector("[data-act=ok]").textContent = confirmLabel;
    document.body.append(backdrop);
    backdrop.querySelector("[data-act=cancel]").addEventListener("click", () => { backdrop.remove(); resolve(false); });
    backdrop.querySelector("[data-act=ok]").addEventListener("click", () => { backdrop.remove(); resolve(true); });
  });
}

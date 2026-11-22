const error = document.querySelector("#admin-error");
const table = document.querySelector("#events");

async function load() {
  try {
    const response = await fetch("/api/admin/events");
    if (response.status === 401) {
      error.textContent = "Chưa đăng nhập. Hãy quay lại trang chính và nhập mật khẩu ở ô tên.";
      return;
    }
    if (!response.ok) throw new Error("Không thể tải nhật ký.");
    const { events } = await response.json();
    document.querySelector("#empty").hidden = events.length !== 0;
    for (const event of events) {
      const row = document.createElement("tr");
      for (const value of [new Date(event.time).toLocaleString("vi-VN"), event.id, event.type, event.value]) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      table.append(row);
    }
  } catch (err) {
    error.textContent = err.message;
  }
}

document.querySelector("#logout").addEventListener("click", async () => {
  try {
    const response = await fetch("/api/admin/logout", { method: "POST" });
    if (!response.ok) throw new Error("Không thể đăng xuất.");
    location.href = "/";
  } catch (err) {
    error.textContent = err.message;
  }
});
load();

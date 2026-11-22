const $ = (selector) => document.querySelector(selector);
const dialogue = $("#dialogue");
const choices = $("#choices");
const form = $("#message-form");
const input = $("#message");
const hint = $("#form-hint");
const error = $("#error");
const giftArea = $("#gift-area");
const character = $("#character");
const background = $("#background-audio");
const recording = $("#recording-audio");
const musicToggle = $("#music-toggle");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let state = "start";
let hasVy = false;
let musicEnabled = true;
let recordingActive = false;
let replayTimer;
let typingTimer;
let waitTimer;
let typing = false;
let finishTyping = () => {};
let sessionReady = false;

async function request(path, data) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Không thể kết nối với máy chủ.");
  return result;
}

async function log(type, value = "") {
  try {
    if (!sessionReady) throw new Error("Chưa kết nối được với máy chủ.");
    await request("/api/events", { type, value });
  } catch (err) {
    error.textContent = `Không lưu được hoạt động: ${err.message}`;
  }
}

function playBackground() {
  if (!musicEnabled || recordingActive || replayTimer) return;
  background.play().catch(() => {
    hint.textContent = "Chạm vào màn hình để bật nhạc nhé ♫";
  });
}

background.addEventListener("ended", () => {
  replayTimer = setTimeout(() => {
    replayTimer = undefined;
    background.currentTime = 0;
    playBackground();
  }, 3000);
});
background.addEventListener("error", () => {
  hint.textContent = "Nhạc nền chưa sẵn sàng ♫";
});
musicToggle.addEventListener("click", () => {
  musicEnabled = !musicEnabled;
  musicToggle.setAttribute("aria-pressed", String(musicEnabled));
  musicToggle.querySelector("span").textContent = `Nhạc: ${musicEnabled ? "bật" : "tắt"}`;
  if (musicEnabled) playBackground();
  else background.pause();
});
document.addEventListener("pointerdown", playBackground);
document.addEventListener("keydown", playBackground);

function buttons(items) {
  choices.replaceChildren();
  for (const [label, action] of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice";
    button.textContent = label;
    button.addEventListener("click", () => {
      log("choice", label);
      action();
    });
    choices.append(button);
  }
}

function say(text, nextState, options = {}) {
  clearInterval(typingTimer);
  clearTimeout(waitTimer);
  state = nextState;
  typing = true;
  choices.replaceChildren();
  dialogue.textContent = "";
  character.dataset.expression = nextState === "name" ? "surprised" : nextState === "birthday-reply" ? "playful" : "happy";
  const chars = Array.from(text);
  let index = 0;
  let completed = false;
  finishTyping = () => {
    if (completed) return;
    completed = true;
    clearInterval(typingTimer);
    dialogue.textContent = text;
    typing = false;
    if (options.choices) buttons(options.choices);
    if (options.after) options.after();
  };
  if (reducedMotion) finishTyping();
  else typingTimer = setInterval(() => {
    dialogue.textContent += chars[index++];
    if (index >= chars.length) finishTyping();
  }, 24);
}

function setChapter(text) { $("#chapter").textContent = text; }
function showForm(show = true) { form.hidden = !show; }

function birthdayQuestion() {
  setChapter("HÔM NAY CỦA EM ✦");
  showForm(false);
  say("Anh chào Vy nhá, cho anh hỏi cái này chút. Hình như hôm nay là sinh nhật em đúng không ấy nhờ", "birthday", {
    choices: [["Dạ đúng rồi ạ", () => wish("today")], ["Dạ hong anh :))", birthdayNo]],
  });
}

function birthdayNo() {
  const now = new Date();
  const day = (now.getMonth() + 1) * 100 + now.getDate();
  let text;
  let when;
  if (day === 1123) {
    text = `${hasVy ? "Xạo nha =)) Anh" : "Lại xạo nữa nha, anh"} thấy sinh nhật em trên Facebook rồi, anh nhớ rõ lắm tại lúc đầu anh tưởng em là cung Bò Cạp giống anh mà không phải, em nằm sát ngay ranh giới giữa Bò Cạp với Nhân Mã luôn`;
    when = "today";
  } else if (day < 1123) {
    text = "Ủa vậy anh nhầm rồi, hình như chưa đến thì phải";
    when = "early";
  } else {
    text = "Ủa vậy anh nhầm rồi, hình như qua rồi thì phải";
    when = "late";
  }
  showForm();
  say(text, "birthday-reply", { choices: [["Dạ", () => wish(when)]] });
  nextAction = () => wish(when);
}

function wish(when) {
  showForm();
  const prefix = when === "early" ? "Mặc dù có hơi sớm nhưng mà " : when === "late" ? "Mặc dù có hơi muộn nhưng mà " : "";
  const ending = when === "today" ? " <3" : "";
  say(`${prefix}Chúc mừng sinh nhật em nha <3 Chúc em tuổi mới sẽ gặp thật nhiều điều tốt đẹp và có thật nhiều lý do để mỉm cười nhé!${ending}`, "wish", {
    choices: ["Dạ em cảm ơn anh", "Dạ em cảm ơn ạ", "Em cảm ơn anh nhìu nha", "Em cảm ơn anh nha <3"].map((label) => [label, giftsIntro]),
  });
  nextAction = giftsIntro;
}

function giftsIntro() {
  setChapter("MÓN QUÀ DÀNH CHO EM ✦");
  say("Anh có chuẩn bị 2 món quà tặng cho em nè", "gifts-intro", { after: showGifts });
  nextAction = openFirstGift;
}

function makeGift(label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "gift";
  button.setAttribute("aria-label", label);
  button.innerHTML = '<span class="gift-bow">♡</span><span class="gift-lid"></span><span class="gift-box"></span>';
  button.addEventListener("click", action);
  return button;
}

function showGifts() {
  giftArea.hidden = false;
  giftArea.replaceChildren(makeGift("Mở hộp quà thứ nhất", openFirstGift), makeGift("Mở hộp quà thứ nhất", openFirstGift));
  hint.textContent = "Chọn một hộp quà để mở nhé ♡";
}

function openFirstGift() {
  log("gift", "Mở quà thứ nhất: ghi âm");
  log("recording", "Mở ghi âm");
  state = "recording";
  choices.replaceChildren();
  giftArea.replaceChildren();
  recordingActive = true;
  background.pause();
  const note = document.createElement("div");
  note.className = "recording-note";
  note.textContent = "Anh cứ ảo tưởng rằng em sẽ thích nghe anh hát nên cứ làm màu ghi âm hát tặng em thôi à, đây anh có làm hẳn nút skip cho em luôn nè để khui nốt quà còn lại cho nhanh";
  const controls = document.createElement("div");
  controls.className = "recording-controls";
  recording.controls = true;
  controls.append(recording);
  const skip = document.createElement("button");
  skip.type = "button";
  skip.className = "choice skip";
  skip.textContent = "Skip →";
  skip.addEventListener("click", () => { log("skip", "Bỏ qua ghi âm"); openFlower(); });
  controls.append(skip);
  giftArea.append(note, controls);
  say("Món quà đầu tiên là một bài hát anh dành tặng em đó ♫", "recording");
  nextAction = openFlower;
  recording.play().catch(() => {
    if (state === "recording") hint.textContent = "Ghi âm chưa sẵn sàng. Em có thể chọn Skip để mở quà tiếp theo nhé.";
  });
}

function finishRecording() {
  recording.pause();
  recordingActive = false;
  playBackground();
}

recording.addEventListener("ended", () => {
  if (state !== "recording") return;
  finishRecording();
  giftArea.replaceChildren(makeGift("Mở hộp quà còn lại", openFlower));
  hint.textContent = "Còn một món quà nữa đang chờ em ♡";
  state = "second-gift";
});
recording.addEventListener("error", () => {
  if (state === "recording") hint.textContent = "Ghi âm chưa sẵn sàng. Em có thể chọn Skip để mở quà tiếp theo nhé.";
});

function openFlower() {
  if (state !== "recording" && state !== "second-gift") return;
  finishRecording();
  log("gift", "Mở quà thứ hai: hoa");
  giftArea.innerHTML = '<div class="bouquet"><div class="bouquet-glow"></div><img src="/images/bouquet.svg" alt="Một bó hoa thật lớn dành tặng Vy"><span class="bouquet-caption">Dành riêng cho em ♡</span></div>';
  const forest = document.createElement("div");
  forest.className = "flower-forest";
  forest.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 36; index += 1) {
    const flower = document.createElement("span");
    flower.className = "forest-flower";
    const side = index < 24;
    const position = index % 12;
    flower.style.setProperty("--x", side ? `${index < 12 ? (position % 3) * 3 : 100 - (position % 3) * 3}%` : `${(index - 24) * 9}%`);
    flower.style.setProperty("--y", side ? `${4 + position * 8}%` : `${95 - (index % 3) * 3}%`);
    flower.style.setProperty("--size", `${36 + (index * 17) % 38}px`);
    flower.style.setProperty("--delay", `${(index % 12) * 0.09}s`);
    flower.style.setProperty("--hue", `${(index % 5) * 28}deg`);
    flower.innerHTML = '<img src="/images/flower.svg" alt="">';
    forest.append(flower);
  }
  document.body.append(forest);
  hint.textContent = "Cả một vườn hoa, dành riêng cho em ♡";
  say("Hoa này không cần tưới, không sợ héo… Và quan trọng là ở xa anh vẫn có thể tặng em được", "flower-one", { choices: [["Dạ ♡", flowerTwo]] });
  nextAction = flowerTwo;
}

function flowerTwo() {
  say("Nói vậy chứ anh mà có cơ hội được tặng em hoa tươi thật thì thật sự anh sẽ vui lắm luôn á", "flower-two", { choices: [["Dạ ♡", endGifts]] });
  nextAction = endGifts;
}

function endGifts() {
  giftArea.hidden = true;
  say("Hết quà rồi đó! Chúc em sinh nhật vui vẻ nha <3", "waiting", {
    after: () => { waitTimer = setTimeout(invitation, 1300); },
  });
  nextAction = () => { hint.textContent = "Chờ anh một chút nhé..."; };
}

function invitation() {
  setChapter("MỘT LỜI NHẮN NHỎ ✦");
  hint.textContent = "Nhắn cho anh để tiếp tục nhé ♡";
  say("À mà khoan, anh có thể rủ em đi chơi được không nhỉ, tối nào anh cũng ok hết nè. Cũng không phải gấp gáp đâu, cứ chọn ngày mà em muốn nhé, hoặc để từ từ em suy nghĩ đến cũng được. Ngày hôm sau nếu anh có hỏi lại thì nếu em thấy khó trả lời thì em cứ seen tin nhắn của anh cũng được là anh hiểu ý nhé. Còn hôm nay em hãy cứ tận hưởng ngày sinh nhật của mình và đừng để tâm tới anh nhé", "invitation", { choices: [["Dạ ♡", finalMessage]] });
  nextAction = finalMessage;
}

function finalMessage() {
  say("Em sinh nhật vui vẻ nha <3", "final", { after: () => { hint.textContent = "Cảm ơn em đã ở đây ♡"; } });
  nextAction = () => {};
}

let nextAction = () => {};
character.addEventListener("click", () => {
  if (state !== "start") return;
  $("#thought").hidden = true;
  $("#tap-hint").hidden = true;
  character.classList.remove("sleeping");
  character.classList.add("waking");
  character.setAttribute("aria-label", "Tuấn đã thức giấc");
  showForm();
  input.placeholder = "Tên em là gì nhỉ?";
  hint.textContent = "Nhập tên của em vào đây nha ♡";
  say("Ô, uầy xinh thế, xin chào cô gái đằng ấy, anh xin tự giới thiệu anh tên là Tuấn, con mẹ Thảo, mà em tên là gì ấy nhỉ?", "name");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = input.value.trim();
  if (!value) return;
  if (state === "name") {
    if (!sessionReady) { error.textContent = "Chưa kết nối được với máy chủ. Hãy tải lại trang."; return; }
    const name = value;
    input.disabled = true;
    try {
      const result = await request("/api/name", { name });
      input.value = "";
      if (result.admin) { location.href = "/ad5112311"; return; }
      const normalized = name.normalize("NFC").toLocaleLowerCase("vi-VN").replace(/\s+/g, " ");
      hasVy = normalized.includes("vy");
      const recognized = hasVy || normalized.includes("zyzy");
      input.placeholder = "Nhắn gì đó cho anh...";
      hint.textContent = "Nhắn cho anh để tiếp tục nhé ♡";
      if (recognized) birthdayQuestion();
      else {
        say("Đừng có xạo, nơi này chỉ có mình anh với em biết thôi, em không phải là Vy thì còn ai vào đây nữa", "name-reply", { choices: [["Dạ, em chào anh", birthdayQuestion]] });
        nextAction = birthdayQuestion;
      }
    } catch (err) { error.textContent = err.message; }
    finally { input.disabled = false; }
    return;
  }
  input.value = "";
  log("message", value);
  if (typing) finishTyping();
  nextAction();
});

try {
  await request("/api/session", {});
  sessionReady = true;
} catch (err) {
  error.textContent = `Không thể lưu hoạt động: ${err.message} Hãy tải lại trang.`;
}
playBackground();

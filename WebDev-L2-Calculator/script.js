// Calculator logic. No eval(): the maths is done with our own code.
// Bottom line = what you type (e.g. 1+2+6+7). Top line = the answer after "=".
// Tap anywhere in the typed sum to move the cursor, or press and drag along it, then delete or type there.
// Long sums shrink to fit the screen; if still too long, the line slides sideways.

const typedEl = document.getElementById("expression");
const resultEl = document.getElementById("result");

const OPS = ["+", "−", "×", "÷"];
const MAX_LENGTH = 40;
const MIN_FONT = 14;     // smallest text size (px) before the line starts sliding

let expr = "";            // everything the user has typed, as text
let cursor = 0;           // where the blinking cursor is (0 = before the first character)
let justEvaluated = false;

// state for dragging the cursor with a finger or mouse
let dragging = false;
let dragX = 0;

function isOp(ch) { return OPS.includes(ch); }

// ---------- Drawing the typed line ----------
// Shrink the text step by step until it fits the screen (never smaller than minPx)
function fitText(el, minPx) {
  el.style.fontSize = "";                                  // back to the size from the CSS file
  let size = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollWidth > el.clientWidth + 1 && size > minPx) {
    size -= 1;
    el.style.fontSize = size + "px";
  }
}

function render() {
  const keepScroll = typedEl.scrollLeft;
  typedEl.textContent = "";

  if (expr === "") {
    const placeholder = document.createElement("span");
    placeholder.className = "placeholder";
    placeholder.textContent = "0";
    typedEl.appendChild(placeholder);
    fitText(typedEl, MIN_FONT);
    typedEl.scrollLeft = 0;
    return;
  }

  // every character gets its own span so it can be tapped
  const caret = document.createElement("span");
  caret.className = "caret";
  for (let i = 0; i <= expr.length; i++) {
    if (i === cursor) typedEl.appendChild(caret);
    if (i < expr.length) {
      const ch = document.createElement("span");
      ch.className = "ch";
      ch.textContent = expr[i];
      ch.dataset.index = i;
      typedEl.appendChild(ch);
    }
  }
  fitText(typedEl, MIN_FONT);
  typedEl.scrollLeft = keepScroll;
  if (!dragging) keepCaretVisible(caret);
}

function keepCaretVisible(caret) {
  if (cursor === expr.length) {
    typedEl.scrollLeft = typedEl.scrollWidth; // newest characters on the right
    return;
  }
  const left = caret.offsetLeft;
  const view = typedEl.clientWidth;
  if (left < typedEl.scrollLeft + 20) typedEl.scrollLeft = Math.max(0, left - 20);
  else if (left > typedEl.scrollLeft + view - 20) typedEl.scrollLeft = left - view + 20;
}

function showResult(text, isError) {
  resultEl.textContent = text;
  resultEl.classList.toggle("error", Boolean(isError));
  fitText(resultEl, MIN_FONT);
}

function clearResult() {
  showResult("", false);
  justEvaluated = false;
}

// ---------- Editing helpers ----------
function insertText(text) {
  expr = expr.slice(0, cursor) + text + expr.slice(cursor);
  cursor += text.length;
}

// start and end of the number the cursor is inside
function numberBounds() {
  let start = cursor;
  while (start > 0 && !isOp(expr[start - 1])) start--;
  let end = cursor;
  while (end < expr.length && !isOp(expr[end])) end++;
  return [start, end];
}

// ---------- Button actions ----------
function inputNumber(digit) {
  if (justEvaluated) { expr = ""; cursor = 0; } // start a fresh sum after an answer
  clearResult();
  if (expr.length >= MAX_LENGTH) return;
  const [start, end] = numberBounds();
  if (expr.slice(start, end) === "0" && cursor === end) {
    expr = expr.slice(0, start) + expr.slice(end); // replace a lone 0 (avoid 007)
    cursor = start;
  }
  insertText(digit);
  render();
}

function inputDecimal() {
  if (justEvaluated) { expr = ""; cursor = 0; }
  clearResult();
  if (expr.length >= MAX_LENGTH) return;
  const [start, end] = numberBounds();
  if (expr.slice(start, end).includes(".")) return; // only one dot per number
  insertText(cursor === start ? "0." : ".");
  render();
}

function inputOperator(op) {
  if (justEvaluated) {
    // continue from the answer: 16 then × 2
    expr = resultEl.textContent.replace("-", "−");
    cursor = expr.length;
  }
  clearResult();

  if (expr === "" || cursor === 0) {
    // the only thing allowed at the very start is a minus (negative number)
    if (op === "−" && !isOp(expr[0]) && expr.length < MAX_LENGTH) { insertText("−"); render(); }
    return;
  }

  const before = expr[cursor - 1];
  const after = expr[cursor];
  if (cursor - 1 === 0 && before === "−") return;  // leading minus: nothing to replace
  if (isOp(before)) {
    expr = expr.slice(0, cursor - 1) + op + expr.slice(cursor);   // change your mind
  } else if (isOp(after)) {
    expr = expr.slice(0, cursor) + op + expr.slice(cursor + 1);   // swap the operator ahead
    cursor++;
  } else if (expr.length < MAX_LENGTH) {
    insertText(op);
  }
  render();
}

function backspace() {
  clearResult();
  if (cursor > 0) {
    expr = expr.slice(0, cursor - 1) + expr.slice(cursor); // delete the character before the cursor
    cursor--;
  }
  render();
}

function deleteForward() {
  clearResult();
  expr = expr.slice(0, cursor) + expr.slice(cursor + 1);
  render();
}

function clearAll() {
  expr = "";
  cursor = 0;
  clearResult();
  render();
}

// ---------- Maths ----------
// Turn "1+2×3" into numbers and operators: [1, "+", 2, "×", 3]
function tokenize(text) {
  const tokens = [];
  let buffer = "";
  for (const ch of text) {
    if (isOp(ch)) {
      if (buffer === "" && tokens.length === 0 && ch === "−") buffer = "-";
      else { tokens.push(parseFloat(buffer), ch); buffer = ""; }
    } else buffer += ch;
  }
  tokens.push(parseFloat(buffer));
  return tokens;
}

// Order of operations: × and ÷ first, then + and −
function calculate(list) {
  const first = [];
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t === "×" || t === "÷") {
      const left = first.pop();
      const right = list[++i];
      if (t === "÷" && right === 0) return null; // division by zero
      first.push(t === "×" ? left * right : left / right);
    } else first.push(t);
  }
  let result = first[0];
  for (let i = 1; i < first.length; i += 2) {
    const right = first[i + 1];
    result = first[i] === "+" ? result + right : result - right;
  }
  return result;
}

function equals() {
  if (expr === "" || justEvaluated) return;
  // ignore trailing operators, e.g. "5+" is treated as "5"
  while (isOp(expr[expr.length - 1])) expr = expr.slice(0, -1);
  cursor = expr.length;
  if (expr === "" || expr === "−") { expr = ""; cursor = 0; render(); return; }
  render();

  const tokens = tokenize(expr);
  if (tokens.some((t) => typeof t === "number" && Number.isNaN(t))) {
    showResult("Invalid expression", true);  // e.g. "2+×3" after editing
    return;
  }
  const result = calculate(tokens);
  if (result === null) {
    showResult("Cannot divide by 0", true);
    return;
  }
  // round off floating point noise like 0.1 + 0.2
  showResult(String(parseFloat(result.toFixed(10))), false);
  justEvaluated = true;
}

// ---------- Event listeners (no inline onclick in the HTML) ----------
document.querySelectorAll("[data-num]").forEach((btn) =>
  btn.addEventListener("click", () => inputNumber(btn.dataset.num))
);
document.querySelectorAll("[data-op]").forEach((btn) =>
  btn.addEventListener("click", () => inputOperator(btn.dataset.op))
);
document.getElementById("decimal").addEventListener("click", inputDecimal);
document.getElementById("equals").addEventListener("click", equals);
document.getElementById("backspace").addEventListener("click", backspace);
document.getElementById("clear").addEventListener("click", clearAll);

// Move the cursor by tapping, or by pressing and dragging along the typed line.
// The cursor goes to whichever gap between characters is closest to your finger.
function cursorFromX(x) {
  let count = 0;
  for (const ch of typedEl.querySelectorAll(".ch")) {
    const box = ch.getBoundingClientRect();
    if (x > box.left + box.width / 2) count++;
    else break;
  }
  return count;
}

function moveCursorToX(x) {
  const target = cursorFromX(x);
  if (target !== cursor) { cursor = target; render(); }
}

// While dragging near the left or right edge, slide the line so you can keep going.
// The closer to the edge (or past it) your finger is, the faster it slides.
function autoScroll() {
  if (!dragging) return;
  const box = typedEl.getBoundingClientRect();
  const edge = 48;
  const fromLeft = dragX - box.left;
  const fromRight = box.right - dragX;
  if (fromLeft < edge) typedEl.scrollLeft -= Math.min(22, 4 + (edge - fromLeft) * 0.4);
  else if (fromRight < edge) typedEl.scrollLeft += Math.min(22, 4 + (edge - fromRight) * 0.4);
  moveCursorToX(dragX);
  requestAnimationFrame(autoScroll);
}

// Make sure the phone treats a drag here as moving the cursor, not scrolling the page
typedEl.style.touchAction = "none";
typedEl.addEventListener("contextmenu", (e) => e.preventDefault()); // no pop-up menu on long press

typedEl.addEventListener("pointerdown", (e) => {
  if (expr === "") return;
  typedEl.setPointerCapture(e.pointerId);
  dragging = true;
  dragX = e.clientX;
  justEvaluated = false; // now we are editing, not starting a new sum
  moveCursorToX(dragX);
  requestAnimationFrame(autoScroll);
});

typedEl.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  dragX = e.clientX;
  moveCursorToX(dragX);
});

function stopDragging() {
  if (!dragging) return;
  dragging = false;
  render();
}
typedEl.addEventListener("pointerup", stopDragging);
typedEl.addEventListener("pointercancel", stopDragging);

// Keyboard support (bonus)
document.addEventListener("keydown", (e) => {
  if (e.key >= "0" && e.key <= "9") inputNumber(e.key);
  else if (e.key === ".") inputDecimal();
  else if (e.key === "+") inputOperator("+");
  else if (e.key === "-") inputOperator("−");
  else if (e.key === "*") inputOperator("×");
  else if (e.key === "/") { e.preventDefault(); inputOperator("÷"); }
  else if (e.key === "Enter" || e.key === "=") equals();
  else if (e.key === "Backspace") backspace();
  else if (e.key === "Delete") deleteForward();
  else if (e.key === "Escape") clearAll();
  else if (e.key === "ArrowLeft") { justEvaluated = false; cursor = Math.max(0, cursor - 1); render(); }
  else if (e.key === "ArrowRight") { justEvaluated = false; cursor = Math.min(expr.length, cursor + 1); render(); }
});

render();

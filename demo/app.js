"use strict";

const primaryFile = document.querySelector("#primary-file");
const otherFiles = document.querySelector("#other-files");
const threshold = document.querySelector("#threshold");
const thresholdOutput = document.querySelector("#threshold-output");
const resetButton = document.querySelector("#load-fixtures");
const status = document.querySelector("#status");
const summary = document.querySelector("#summary");
const rows = document.querySelector("#rows");

let primary;
let others = [];

function time(seconds) {
  const rounded = Math.floor(Number(seconds) || 0);
  return `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function addTranscript(container, source, text) {
  container.append(element("div", "source", source));
  container.append(element("p", "text", text || "（該当なし）"));
}

function render() {
  try {
    const result = AsrConsensus.compare(primary, others, { threshold: threshold.value });
    rows.replaceChildren();
    const flagged = result.rows.filter((row) => row.flagged).length;
    summary.textContent = `${flagged} / ${result.rows.length} 区間を確認`;

    for (const item of result.rows) {
      const card = element("article", `row${item.flagged ? " flagged" : ""}`);
      const head = element("div", "row-head");
      head.append(element("span", "", `${time(item.start)}–${time(item.end)} · ${item.speaker || "話者不明"}`));
      head.append(element("span", "badge", item.flagged ? "要確認" : "一致"));
      card.append(head);

      const transcripts = element("div", "transcript");
      addTranscript(transcripts, primary.source, item.primary);
      for (const comparison of item.comparisons) addTranscript(transcripts, comparison.source, comparison.text);
      card.append(transcripts);
      rows.append(card);
    }
    status.textContent = "比較はこのブラウザ内だけで完了しました。";
  } catch (error) {
    status.textContent = error.message;
    summary.textContent = "";
    rows.replaceChildren();
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} を読み込めませんでした。`);
  return response.json();
}

async function loadFixtures() {
  try {
    [primary, ...others] = await Promise.all([
      fetchJson("./fixtures/primary.json"),
      fetchJson("./fixtures/comparison-a.json"),
      fetchJson("./fixtures/comparison-b.json"),
    ]);
    primaryFile.value = "";
    otherFiles.value = "";
    render();
  } catch (error) {
    status.textContent = error.message;
  }
}

async function readFile(file) {
  return JSON.parse(await file.text());
}

primaryFile.addEventListener("change", async () => {
  if (!primaryFile.files[0]) return;
  try {
    primary = await readFile(primaryFile.files[0]);
    render();
  } catch (error) {
    status.textContent = `基準JSONを読み込めません: ${error.message}`;
  }
});

otherFiles.addEventListener("change", async () => {
  try {
    others = await Promise.all([...otherFiles.files].map(readFile));
    render();
  } catch (error) {
    status.textContent = `比較JSONを読み込めません: ${error.message}`;
  }
});

threshold.addEventListener("input", () => {
  thresholdOutput.value = Number(threshold.value).toFixed(2);
  if (primary) render();
});
resetButton.addEventListener("click", loadFixtures);
loadFixtures();

function toggleMenu() {
  const menu = document.getElementById("menu");
  if (menu) menu.style.display = (menu.style.display === "block") ? "none" : "block";
}

async function loadLibrary() {
  const res = await fetch("../library.json");
  const data = await res.json();
  const grid = document.getElementById("library-grid");

  for (let series in data) {
    const div = document.createElement("div");
    div.className = "library-item";
    div.innerHTML = `<h3>${series}</h3>`;

    // Add chapter links
    const chapters = data[series].chapters;
    for (let chapter in chapters) {
      const a = document.createElement("a");
      a.href = `reader.html?series=${encodeURIComponent(series)}&chapter=${encodeURIComponent(chapter)}`;
      a.textContent = chapter;
      div.appendChild(a);
    }

    grid.appendChild(div);
  }
}

async function loadReader() {
  const params = new URLSearchParams(window.location.search);
  const series = params.get("series");
  const chapter = params.get("chapter");

  const res = await fetch("../library.json");
  const data = await res.json();

  document.getElementById("chapter-title").textContent = `${series} - ${chapter}`;
  const container = document.getElementById("pages");
  container.innerHTML = "";

  const seriesData = data[series];
  const files = seriesData.chapters[chapter];
  files.forEach(file => {
    const img = document.createElement("img");
    img.src = `../${seriesData.path}/${chapter}/${file}`;
    img.style.width = "100%";
    container.appendChild(img);
  });
}

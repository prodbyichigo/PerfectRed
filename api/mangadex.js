const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

/**
 * Utility to run async tasks with limited concurrency
 */
async function withConcurrencyLimit(limit, tasks) {
  const results = [];
  const executing = [];

  for (const task of tasks) {
    const p = Promise.resolve().then(() => task());
    results.push(p);

    if (limit <= tasks.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }

  return Promise.all(results);
}

class MangaDex {
  async fetchPopularManga(limit = 100) {
    try {
      const url = `https://api.mangadex.org/manga?limit=${limit}&includes[]=cover_art&order[followedCount]=desc`;
      const res = await fetch(url);

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`MangaDex API error: ${res.status} - ${text}`);
      }

      const data = await res.json();
      if (!data || !Array.isArray(data.data)) {
        throw new Error(`Invalid MangaDex response format: ${JSON.stringify(data)}`);
      }

      const filtered = [];
      for (const manga of data.data) {
        // Check if chapter 1 exists in English
        const chapRes = await fetch(
          `https://api.mangadex.org/chapter?manga=${manga.id}&translatedLanguage[]=en&chapter=1&limit=1`
        );
        const chapData = await chapRes.json();

        if (!chapData.data || chapData.data.length === 0) continue;

        const titles = manga.attributes.title;
        const name = titles.en || Object.values(titles)[0] || "Untitled";

        const coverRel = manga.relationships.find(r => r.type === "cover_art");
        const fileName = coverRel?.attributes?.fileName;
        const coverUrl = fileName
          ? `https://uploads.mangadex.org/covers/${manga.id}/${fileName}.256.jpg`
          : null;

        filtered.push({
          id: manga.id,
          title: name,
          coverUrl
        });
      }

      return filtered;
    } catch (err) {
      console.error("Error fetching manga:", err);
      return [];
    }
  }

  /**
   * Fetch detailed info for popular manga with EN chapter 1
   */
  async fetchPopularMangaDetails(limit = 100) {
    try {
      const url = `https://api.mangadex.org/manga?limit=${limit}&includes[]=cover_art&order[followedCount]=desc`;
      const res = await fetch(url);

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`MangaDex API error: ${res.status} - ${text}`);
      }

      const data = await res.json();
      if (!data || !Array.isArray(data.data)) {
        throw new Error(`Invalid MangaDex response format: ${JSON.stringify(data)}`);
      }

      const tasks = data.data.map(manga => async () => {
        // Check for English chapter 1
        const chapRes = await fetch(
          `https://api.mangadex.org/chapter?manga=${manga.id}&translatedLanguage[]=en&chapter=1&limit=1`
        );
        const chapData = await chapRes.json();
        if (!chapData.data || chapData.data.length === 0) return null;

        const titles = manga.attributes.title;
        const name = titles.en || Object.values(titles)[0] || "Untitled";

        const coverRel = manga.relationships.find(r => r.type === "cover_art");
        const fileName = coverRel?.attributes?.fileName;
        const coverUrl = fileName
          ? `https://uploads.mangadex.org/covers/${manga.id}/${fileName}.512.jpg`
          : null;

        // Total EN chapters
        const countRes = await fetch(
          `https://api.mangadex.org/chapter?manga=${manga.id}&translatedLanguage[]=en&limit=0`
        );
        const countData = await countRes.json();
        const chapterCount = countData.total || 0;

        return {
          id: manga.id,
          title: name,
          coverUrl,
          chapterCount,
          availableLanguages: manga.attributes.availableTranslatedLanguages
        };
      });

      const details = await withConcurrencyLimit(5, tasks);
      return details.filter(Boolean);
    } catch (err) {
      console.error("Error fetching manga:", err);
      return [];
    }
  }
}

module.exports = MangaDex;

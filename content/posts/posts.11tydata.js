module.exports = {
  layout: "post.njk",
  eleventyComputed: {
    // IMPORTANT: don't use data.page.fileSlug here — Eleventy strips the
    // date prefix from date-prefixed filenames by default, so two posts
    // with the same title text on different days (e.g. a recurring
    // franchise headline like "Gear and Supplements From Your Favorite
    // Sports Stars" that a source reruns periodically) collapse to the
    // identical slug and collide on the same URL, breaking the whole
    // build. filePathStem keeps the date, which fetch-feed.js already
    // guarantees makes every filename unique.
    // IMPORTANT: neither data.page.fileSlug NOR data.page.filePathStem can
    // be trusted here — Eleventy strips the date prefix from both for
    // date-prefixed filenames. Two posts with the same title text on
    // different days (e.g. a recurring franchise headline like "Gear and
    // Supplements From Your Favorite Sports Stars" that a source reruns
    // periodically) collapse to the identical slug on either of those and
    // collide on the same URL, breaking the whole build. inputPath is the
    // one field that reliably keeps the full original filename, date
    // prefix and all, which is what fetch-feed.js already guarantees is
    // unique.
    permalink: (data) => {
      const base = data.page.inputPath
        .split("/")
        .pop()
        .replace(/\.md$/, "");
      return `/${data.type || "post"}/${base}/`;
    },
    description: (data) => {
      if (data.excerpt) return data.excerpt;
      if (data.type === "wire") return `${data.title} — curated from ${data.source_name}, via RumorMouth's Wire.`;
      if (data.type === "release") return `${data.title} — a press release via ${data.source_name}.`;
      return `${data.title} — an original piece from RumorMouth.`;
    },
  },
};

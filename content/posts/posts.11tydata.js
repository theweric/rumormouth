module.exports = {
  layout: "post.njk",
  eleventyComputed: {
    permalink: (data) => `/${data.type || "post"}/${data.page.fileSlug}/`,
    description: (data) => {
      if (data.excerpt) return data.excerpt;
      if (data.type === "wire") return `${data.title} — curated from ${data.source_name}, via RumorMouth's Wire.`;
      if (data.type === "release") return `${data.title} — a press release via ${data.source_name}.`;
      return `${data.title} — an original piece from RumorMouth.`;
    },
  },
};

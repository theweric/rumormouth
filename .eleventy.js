module.exports = function (eleventyConfig) {
  eleventyConfig.ignores.add("README.md");
  eleventyConfig.ignores.add("node_modules/**");

  // Static assets — copied as-is into the build output.
  eleventyConfig.addPassthroughCopy("styles.css");
  eleventyConfig.addPassthroughCopy("script.js");
  eleventyConfig.addPassthroughCopy("_headers");
  eleventyConfig.addPassthroughCopy({ assets: "assets" });

  // All Markdown posts, newest first.
  eleventyConfig.addCollection("posts", (api) =>
    api.getFilteredByGlob("content/posts/*.md").sort((a, b) => b.date - a.date)
  );

  eleventyConfig.addCollection("wirePosts", (api) =>
    api
      .getFilteredByGlob("content/posts/*.md")
      .filter((p) => p.data.type === "wire" || p.data.type === "release")
      .sort((a, b) => b.date - a.date)
  );

  eleventyConfig.addCollection("originalPosts", (api) =>
    api
      .getFilteredByGlob("content/posts/*.md")
      .filter((p) => p.data.type === "original")
      .sort((a, b) => b.date - a.date)
  );

  eleventyConfig.addFilter("dateDisplay", (d) =>
    new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
  );

  eleventyConfig.addFilter("truncate", (str, n) =>
    (str || "").length > n ? str.slice(0, n).trim() + "…" : str
  );

  eleventyConfig.addFilter("striptags", (str) => {
    const noTags = (str || "").replace(/<[^>]+>/g, "");
    return noTags
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  });

  return {
    dir: {
      input: ".",
      includes: "_includes",
      output: "_site",
    },
    templateFormats: ["njk", "md", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};

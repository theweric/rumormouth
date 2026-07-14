module.exports = {
  layout: "post.njk",
  eleventyComputed: {
    permalink: (data) => `/${data.type || "post"}/${data.page.fileSlug}/`,
  },
};

module.exports = {
  layout: "news-article.njk",
  permalink: "/novyny/{{ page.fileSlug | ukslug }}/",
  eleventyComputed: {
    // use the excerpt as the page meta description
    description: (data) => data.excerpt || "",
  },
};

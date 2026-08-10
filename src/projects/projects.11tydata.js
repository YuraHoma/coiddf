module.exports = {
  layout: "project-article.njk",
  permalink: "/proyekty/{{ page.fileSlug | ukslug }}/",
  eleventyComputed: {
    // короткий опис проєкту стає meta description сторінки
    description: (data) => data.excerpt || "",
  },
};

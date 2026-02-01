// content/old-reddit.js - Handler for Old Reddit (old.reddit.com)

function filterOldRedditPosts(containsKeyword) {
  // Old Reddit posts are in elements with class "thing" and "link"
  const posts = document.querySelectorAll('.thing.link:not([data-filtered])');
  let blockedCount = 0;

  posts.forEach(post => {
    post.setAttribute('data-filtered', 'true');

    // Get post title - usually in <a> with class "title"
    const titleElement = post.querySelector('a.title');
    if (!titleElement) return;

    const title = titleElement.textContent || '';

    if (containsKeyword(title)) {
      post.style.display = 'none';
      blockedCount++;
    }
  });

  return blockedCount;
}

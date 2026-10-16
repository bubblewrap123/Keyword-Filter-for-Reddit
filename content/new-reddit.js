// content/new-reddit.js - Handler for New Reddit (www.reddit.com)

function filterNewRedditPosts(shouldHide, hidePost) {
  let blockedCount = 0;

  // New Reddit uses shreddit-post custom elements (2024+ redesign)
  const shredditPosts = document.querySelectorAll('shreddit-post:not([data-filtered])');

  shredditPosts.forEach(post => {
    post.setAttribute('data-filtered', 'true');

    // Get title from slot or attribute
    const titleSlot = post.querySelector('[slot="title"]');
    const title = titleSlot?.textContent ||
                  post.getAttribute('post-title') ||
                  '';

    if (shouldHide(title, post.getAttribute('permalink'))) {
      // Feed posts are wrapped in an <article>; hide the wrapper so no empty slot is left
      blockedCount += hidePost(post.closest('article') || post);
    }
  });

  // Handle older new Reddit structure (data-testid approach)
  const testIdPosts = document.querySelectorAll(
    '[data-testid="post-container"]:not([data-filtered])'
  );

  testIdPosts.forEach(post => {
    post.setAttribute('data-filtered', 'true');

    if (isInsidePostOrComment(post)) return;

    // Title usually in h3 or specific data-testid
    const titleElement = post.querySelector('h3, [data-testid="post-title"]');
    const title = titleElement?.textContent || '';
    const link = post.querySelector('a[href*="/comments/"]');

    if (shouldHide(title, link?.getAttribute('href'))) {
      blockedCount += hidePost(post);
    }
  });

  // Handle article-based posts (another variation)
  const articlePosts = document.querySelectorAll(
    'article:not([data-filtered])'
  );

  articlePosts.forEach(post => {
    post.setAttribute('data-filtered', 'true');

    // Already handled above via the post element inside it
    if (post.querySelector('shreddit-post, [data-testid="post-container"]')) return;
    if (isInsidePostOrComment(post)) return;

    // Prefer a real title element; a comments link is only a fallback
    const link = post.querySelector('a[href*="/comments/"]');
    const titleElement = post.querySelector('h3, [slot="title"]') || link;
    const title = titleElement?.textContent || '';

    if (shouldHide(title, link?.getAttribute('href'))) {
      blockedCount += hidePost(post);
    }
  });

  return blockedCount;
}

// Content inside a post body or a comment (headings, embeds, links) is never a post itself
function isInsidePostOrComment(element) {
  return !!element.parentElement?.closest(
    'shreddit-post, shreddit-comment, [data-testid="post-container"], [data-testid="comment"]'
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'www.thedreamer.app') {
      url.hostname = 'thedreamer.app';
      url.protocol = 'https:';
      return Response.redirect(url.href, 301);
    }
    const aliases = { '/privacy-policy': '/privacy', '/terms-of-use': '/terms', '/terms-and-conditions': '/terms', '/help': '/support', '/account-deletion': '/delete-account' };
    if (aliases[url.pathname.replace(/\/$/, '')]) {
      url.pathname = aliases[url.pathname.replace(/\/$/, '')];
      return Response.redirect(url.href, 301);
    }
    if (url.pathname === '/download') {
      return Response.redirect('https://apps.apple.com/app/id6740153274', 302);
    }
    return env.ASSETS.fetch(request);
  }
};

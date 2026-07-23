self.addEventListener('push', (event) => {
  const data = event.data.json();
  console.log('[sw] push received', data);
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/favicon.svg',
      data: { url: data.url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data.url, self.location.origin).href;
  console.log('[sw] notification clicked, opening', targetUrl);
  event.waitUntil(clients.openWindow(targetUrl));
});

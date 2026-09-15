import { Redirect } from 'expo-router';

/**
 * A link to a screen that does not exist, from an old build or a mistyped
 * URL, lands on home, whose gate then picks the right screen. Without this,
 * expo-router shows its developer page, with a sitemap of every route.
 */
export default function NotFound() {
  return <Redirect href="/" />;
}

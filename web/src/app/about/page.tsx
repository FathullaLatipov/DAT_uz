import { permanentRedirect } from "next/navigation";

/** The product story now lives on the home page; keep old links and bookmarks working. */
export default function About() {
  permanentRedirect("/");
}

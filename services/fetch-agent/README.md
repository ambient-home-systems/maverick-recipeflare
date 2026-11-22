# Fetch agent

Placeholder. The fetch agent arrives in Phase 3.

It will be a small Docker image that runs on a home server, pulls video-import jobs from a Cloudflare Queue, downloads audio, subtitles and keyframes with yt-dlp and ffmpeg, and uploads them to R2. See "Social-media video import" in the [build plan](../../docs/build-plan.md).

It is not part of the pnpm workspace: it has its own runtime and release cycle, and shares only the job message format with the Worker.

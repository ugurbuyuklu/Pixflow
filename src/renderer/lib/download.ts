/**
 * Download a video file to the user's device
 */
export async function downloadVideo(url: string, filename: string): Promise<void> {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
}

export function formatDate(date: Date | string): string {
  if (typeof date === "string") {
    date = new Date(date);
  }
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short", // Short weekday (e.g., MON)
    month: "short", // Short month (e.g., DEC)
    day: "numeric", // Numeric day (e.g., 16)
  };

  return new Intl.DateTimeFormat("en-GB", options).format(date).toUpperCase();
}

export function millisecondsToMMSS(milliseconds: number) {
  let seconds = Math.floor(milliseconds / 1000);
  let minutes = Math.floor(seconds / 60);
  seconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}`;
}

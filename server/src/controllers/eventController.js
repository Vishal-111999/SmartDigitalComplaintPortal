const { subscribeToComplaintEvents } = require("../utils/complaintEvents");

function streamEvents(request, response) {
  response.set({
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream",
    "X-Accel-Buffering": "no",
  });
  response.flushHeaders();
  response.write("event: ready\ndata: {}\n\n");

  const topic = request.user.role === "admin" ? "admin" : `user:${request.user.id}`;
  const unsubscribe = subscribeToComplaintEvents(topic, (event) => {
    const eventName = event.type === "account-suspended" ? "account.suspended" : "complaint.updated";
    response.write(`event: ${eventName}\ndata: ${JSON.stringify(event)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    response.write(": keep-alive\n\n");
  }, 25_000);
  heartbeat.unref();

  request.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

module.exports = { streamEvents };

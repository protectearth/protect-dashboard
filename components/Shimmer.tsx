import React from "react";

function Shimmer({
  width = 100,
  height = "auto",
}: {
  width?: string | number;
  height?: string | number;
}) {
  const styles = {
    width,
    height,
  };

  return <div className="shimmer-bg content-line" style={styles}></div>;
}

export default Shimmer;

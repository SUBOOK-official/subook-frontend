function ContentContainer({ as: Component = "div", children, className = "", ...props }) {
  const containerClassName = ["public-content-container", className].filter(Boolean).join(" ");

  return (
    <Component className={containerClassName} {...props}>
      {children}
    </Component>
  );
}

export default ContentContainer;

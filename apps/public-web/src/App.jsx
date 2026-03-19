import { Navigate, Route, Routes } from "react-router-dom";
import PublicHomePage from "./pages/PublicHomePage";
import PublicStorePage from "./pages/PublicStorePage";

function App() {
  return (
    <Routes>
      <Route element={<PublicHomePage />} path="/" />
      <Route element={<PublicStorePage />} path="/store" />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}

export default App;

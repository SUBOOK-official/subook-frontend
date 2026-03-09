import { Navigate, Route, Routes } from "react-router-dom";
import SellerLookupPage from "./pages/SellerLookupPage";

function App() {
  return (
    <Routes>
      <Route element={<SellerLookupPage />} path="/" />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}

export default App;

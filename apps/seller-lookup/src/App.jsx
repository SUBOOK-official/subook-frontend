import { Navigate, Route, Routes } from "react-router-dom";
import SellerLookupPage from "./pages/SellerLookupPage";
import MaintenancePage from "./pages/MaintenancePage";

const SELLER_LOOKUP_MAINTENANCE_END_AT = "2026-04-09T00:00:00+09:00";

function isSellerLookupMaintenanceActive() {
  return Date.now() < new Date(SELLER_LOOKUP_MAINTENANCE_END_AT).getTime();
}

function App() {
  if (isSellerLookupMaintenanceActive()) {
    return <MaintenancePage />;
  }

  return (
    <Routes>
      <Route element={<SellerLookupPage />} path="/" />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}

export default App;

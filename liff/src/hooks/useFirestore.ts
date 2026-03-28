import { useState, useEffect } from "react";
import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  setDoc, query, orderBy, limit, where, serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";

function uid() {
  return auth.currentUser?.uid;
}

// ─── 家族構成 ────────────────────────────────────────────────
export function useFamilyProfile() {
  const [profile, setProfile] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = uid();
    if (!u) return;
    Promise.all([
      getDoc(doc(db, "users", u, "familyProfile", "profile")),
      getDocs(collection(db, "users", u, "familyMembers")),
    ]).then(([profileSnap, membersSnap]) => {
      setProfile(profileSnap.exists() ? profileSnap.data() : null);
      setMembers(membersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  const saveProfile = async (data: any) => {
    const u = uid()!;
    await setDoc(doc(db, "users", u, "familyProfile", "profile"), {
      ...data, uid: u, updatedAt: serverTimestamp(),
    });
    setProfile(data);
  };

  const addMember = async (data: any) => {
    const u = uid()!;
    const ref = await addDoc(collection(db, "users", u, "familyMembers"), data);
    setMembers((prev) => [...prev, { id: ref.id, ...data }]);
  };

  const deleteMember = async (memberId: string) => {
    const u = uid()!;
    await deleteDoc(doc(db, "users", u, "familyMembers", memberId));
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
  };

  return { profile, members, loading, saveProfile, addMember, deleteMember };
}

// ─── 冷蔵庫在庫 ─────────────────────────────────────────────
export function useFridgeItems() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = uid();
    if (!u) return;
    getDocs(collection(db, "users", u, "fridgeItems")).then((snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  const addItem = async (data: any) => {
    const u = uid()!;
    const ref = await addDoc(collection(db, "users", u, "fridgeItems"), {
      ...data, uid: u, addedAt: serverTimestamp(),
    });
    setItems((prev) => [...prev, { id: ref.id, ...data }]);
  };

  const deleteItem = async (itemId: string) => {
    const u = uid()!;
    await deleteDoc(doc(db, "users", u, "fridgeItems", itemId));
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  return { items, loading, addItem, deleteItem };
}

// ─── マイ店舗 ────────────────────────────────────────────────
export function useStores() {
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = uid();
    if (!u) return;
    getDocs(collection(db, "users", u, "stores")).then((snap) => {
      setStores(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  const addStore = async (data: any) => {
    const u = uid()!;
    const ref = await addDoc(collection(db, "users", u, "stores"), {
      ...data, uid: u, updatedAt: serverTimestamp(),
    });
    setStores((prev) => [...prev, { id: ref.id, ...data }]);
  };

  const updateStore = async (storeId: string, data: any) => {
    const u = uid()!;
    await updateDoc(doc(db, "users", u, "stores", storeId), {
      ...data, updatedAt: serverTimestamp(),
    });
    setStores((prev) => prev.map((s) => (s.id === storeId ? { ...s, ...data } : s)));
  };

  const deleteStore = async (storeId: string) => {
    const u = uid()!;
    await deleteDoc(doc(db, "users", u, "stores", storeId));
    setStores((prev) => prev.filter((s) => s.id !== storeId));
  };

  return { stores, loading, addStore, updateStore, deleteStore };
}

// ─── 買い物リスト ────────────────────────────────────────────
export function useShoppingItems(listDate: string) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = uid();
    if (!u) return;
    getDocs(
      query(
        collection(db, "users", u, "shoppingItems"),
        where("listDate", "==", listDate),
        orderBy("addedAt", "asc")
      )
    ).then((snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, [listDate]);

  const toggleItem = async (itemId: string, isChecked: boolean) => {
    const u = uid()!;
    await updateDoc(doc(db, "users", u, "shoppingItems", itemId), { isChecked });
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, isChecked } : i)));
  };

  const addItem = async (name: string) => {
    const u = uid()!;
    const ref = await addDoc(collection(db, "users", u, "shoppingItems"), {
      uid: u, listDate, name, isChecked: false, addedAt: serverTimestamp(),
    });
    setItems((prev) => [...prev, { id: ref.id, name, isChecked: false, listDate }]);
  };

  const deleteItem = async (itemId: string) => {
    const u = uid()!;
    await deleteDoc(doc(db, "users", u, "shoppingItems", itemId));
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  return { items, loading, toggleItem, addItem, deleteItem };
}

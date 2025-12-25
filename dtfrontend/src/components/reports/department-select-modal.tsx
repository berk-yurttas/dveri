import React, { useState, useEffect } from 'react'
import { X, ChevronRight, ChevronDown, Check, Search, Loader2, Shield, User as UserIcon, Building } from 'lucide-react'
import { api } from '@/lib/api'
import { createPortal } from 'react-dom'

interface DepartmentNode {
  id: string // Full path (e.g. "dep1_dep2")
  name: string // Display name (e.g. "dep2")
  children: DepartmentNode[]
  level: number
}

interface UserInfo {
  id: number
  username: string
  name: string
  email: string
  department?: string
}

interface DepartmentSelectModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (selectedDepartments: string[], selectedUsers: string[]) => void
  initialSelectedDepartments?: string[]
  initialSelectedUsers?: string[]
}

export function DepartmentSelectModal({ 
  isOpen, 
  onClose, 
  onSave, 
  initialSelectedDepartments = [], 
  initialSelectedUsers = [] 
}: DepartmentSelectModalProps) {
  const [activeTab, setActiveTab] = useState<'departments' | 'users'>('departments')
  
  // Department State
  const [loading, setLoading] = useState(true)
  const [departments, setDepartments] = useState<DepartmentNode[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialSelectedDepartments))
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [error, setError] = useState<string | null>(null)

  // User State
  const [userSearchTerm, setUserSearchTerm] = useState('')
  const [userResults, setUserResults] = useState<UserInfo[]>([])
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set(initialSelectedUsers))
  const [userLoading, setUserLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      fetchDepartments()
      setSelectedUsers(new Set(initialSelectedUsers))
      setUserResults([])
      setUserSearchTerm('')
      setActiveTab('departments')
    }
  }, [isOpen])

  const fetchDepartments = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await api.get<{ departments: string[] }>('/users/departments')
      
      const nodes = buildDepartmentTree(response.departments)
      setDepartments(nodes)
      
      // Hydrate selection from initialSelected (expand parents to children)
      const expandedSelection = new Set(initialSelectedDepartments)
      initialSelectedDepartments.forEach(id => {
          const node = findNode(nodes, id)
          if (node) {
              const childrenIds = new Set<string>()
              collectChildIds(node, childrenIds)
              childrenIds.forEach(childId => expandedSelection.add(childId))
          }
      })
      setSelectedIds(expandedSelection)
      
      // Calculate expanded nodes (ancestors of selected nodes) to show checked items
      const initialExpanded = new Set<string>()
      expandedSelection.forEach(id => {
        const parts = id.split('_')
        let currentPath = ''
        for (let i = 0; i < parts.length - 1; i++) {
          currentPath = currentPath ? `${currentPath}_${parts[i]}` : parts[i]
          initialExpanded.add(currentPath)
        }
      })
      setExpandedIds(initialExpanded)
    } catch (err) {
      console.error('Failed to fetch departments:', err)
      setError('Departmanlar yüklenirken bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  const buildDepartmentTree = (rawDepartments: string[]): DepartmentNode[] => {
    const rootNodes: DepartmentNode[] = []
    const nodeMap = new Map<string, DepartmentNode>()

    // Sort by length to process shorter (parent) paths first, though not strictly necessary with this logic
    const sortedDeps = [...rawDepartments].sort()

    sortedDeps.forEach(dep => {
      const parts = dep.split('_')
      let currentPath = ''
      let parent: DepartmentNode | null = null

      parts.forEach((part, index) => {
        const isLast = index === parts.length - 1
        const path = currentPath ? `${currentPath}_${part}` : part
        
        if (!nodeMap.has(path)) {
          const newNode: DepartmentNode = {
            id: path,
            name: part,
            children: [],
            level: index
          }
          nodeMap.set(path, newNode)
          
          if (parent) {
            // Check if child already exists (shouldn't happen if map check works, but for safety)
            if (!parent.children.find(c => c.id === newNode.id)) {
              parent.children.push(newNode)
            }
          } else {
            // Top level
            if (!rootNodes.find(n => n.id === newNode.id)) {
              rootNodes.push(newNode)
            }
          }
        }
        
        parent = nodeMap.get(path)!
        currentPath = path
      })
    })

    return rootNodes
  }

  const collectChildIds = (node: DepartmentNode, ids: Set<string>) => {
    ids.add(node.id)
    node.children.forEach(child => collectChildIds(child, ids))
  }

  // Find a node by ID in the tree
  const findNode = (nodes: DepartmentNode[], id: string): DepartmentNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node
      const found = findNode(node.children, id)
      if (found) return found
    }
    return null
  }

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds)
    const node = findNode(departments, id)
    
    if (!node) return

    const isSelected = newSelected.has(id)
    
    if (isSelected) {
      // Deselect parent and all children
      newSelected.delete(id)
      const childrenIds = new Set<string>()
      // We don't include the parent itself in collectChildIds recursion if we call it on children
      node.children.forEach(child => collectChildIds(child, childrenIds))
      childrenIds.forEach(childId => newSelected.delete(childId))

      // Deselect ancestors
      const parts = id.split('_')
      let currentPath = ''
      for (let i = 0; i < parts.length - 1; i++) {
          currentPath = currentPath ? `${currentPath}_${parts[i]}` : parts[i]
          newSelected.delete(currentPath)
      }
    } else {
      // Select parent and all children
      newSelected.add(id)
      const childrenIds = new Set<string>()
      node.children.forEach(child => collectChildIds(child, childrenIds))
      childrenIds.forEach(childId => newSelected.add(childId))
    }
    setSelectedIds(newSelected)
  }

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedIds(newExpanded)
  }

  const processNode = (node: DepartmentNode, selected: Set<string>): { fullySelected: boolean, ids: string[] } => {
    if (node.children.length === 0) {
        const isSelected = selected.has(node.id)
        return { fullySelected: isSelected, ids: isSelected ? [node.id] : [] }
    }

    const childResults = node.children.map(child => processNode(child, selected))
    const allChildrenSelected = childResults.every(r => r.fullySelected)

    if (allChildrenSelected) {
        return { fullySelected: true, ids: [node.id] }
    } else {
        const ids = childResults.flatMap(r => r.ids)
        return { fullySelected: false, ids }
    }
  }

  const handleSave = () => {
    const optimizedIds = departments.flatMap(root => processNode(root, selectedIds).ids)
    onSave(optimizedIds, Array.from(selectedUsers))
    onClose()
  }

  const searchUsers = async () => {
    if (!userSearchTerm.trim()) return
    
    try {
      setUserLoading(true)
      const response = await api.get<{ users: UserInfo[] }>(`/users/search?q=${encodeURIComponent(userSearchTerm)}`)
      setUserResults(response.users)
    } catch (err) {
      console.error('Failed to search users:', err)
    } finally {
      setUserLoading(false)
    }
  }

  const toggleUserSelection = (username: string) => {
    const newSelected = new Set(selectedUsers)
    if (newSelected.has(username)) {
      newSelected.delete(username)
    } else {
      newSelected.add(username)
    }
    setSelectedUsers(newSelected)
  }

  // Filter nodes based on search term
  const filterNodes = (nodes: DepartmentNode[]): DepartmentNode[] => {
    if (!searchTerm) return nodes

    return nodes.reduce<DepartmentNode[]>((acc, node) => {
      const matches = node.name.toLowerCase().includes(searchTerm.toLowerCase())
      const filteredChildren = filterNodes(node.children)
      
      if (matches || filteredChildren.length > 0) {
        acc.push({
          ...node,
          children: filteredChildren
        })
        // Auto expand if children match
        if (filteredChildren.length > 0 && !expandedIds.has(node.id)) {
            // We can't easily update state during render, but we can rely on search results being expanded by default logic if we wanted
            // For now, standard tree behavior
        }
      }
      return acc
    }, [])
  }

  const renderTree = (nodes: DepartmentNode[]) => {
    if (nodes.length === 0) {
      if (searchTerm && nodes === departments) { // Only show if root level empty
          return <div className="text-sm text-gray-500 text-center py-4">Sonuç bulunamadı</div>
      }
      return null
    }

    return (
      <div className="pl-2">
        {nodes.map(node => {
          const isExpanded = expandedIds.has(node.id) || (searchTerm.length > 0) // Auto expand on search
          const isSelected = selectedIds.has(node.id)
          const hasChildren = node.children.length > 0

          return (
            <div key={node.id} className="my-1">
              <div className="flex items-center gap-1 hover:bg-gray-50 rounded p-1">
                <button
                  onClick={() => toggleExpand(node.id)}
                  className={`p-0.5 text-gray-500 hover:bg-gray-200 rounded ${!hasChildren ? 'invisible' : ''}`}
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                
                <div 
                  className="flex items-center gap-2 cursor-pointer flex-1"
                  onClick={() => toggleSelection(node.id)}
                >
                  <div className={`
                    h-4 w-4 rounded border flex items-center justify-center transition-colors
                    ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}
                  `}>
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <span className="text-sm text-gray-700 select-none">{node.name}</span>
                </div>
              </div>
              
              {hasChildren && isExpanded && (
                <div className="border-l border-gray-200 ml-2.5">
                  {renderTree(node.children)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const filteredDepartments = filterNodes(departments)

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-800">Yetkilendirme</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            className={`flex-1 py-3 text-sm font-medium text-center transition-colors relative ${
              activeTab === 'departments' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('departments')}
          >
            <div className="flex items-center justify-center gap-2">
              <Building className="h-4 w-4" />
              Departmanlar
              {selectedIds.size > 0 && (
                <span className="bg-blue-100 text-blue-600 text-[10px] px-1.5 py-0.5 rounded-full">
                  {selectedIds.size}
                </span>
              )}
            </div>
            {activeTab === 'departments' && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600" />
            )}
          </button>
          <button
            className={`flex-1 py-3 text-sm font-medium text-center transition-colors relative ${
              activeTab === 'users' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('users')}
          >
            <div className="flex items-center justify-center gap-2">
              <UserIcon className="h-4 w-4" />
              Kullanıcılar
              {selectedUsers.size > 0 && (
                <span className="bg-blue-100 text-blue-600 text-[10px] px-1.5 py-0.5 rounded-full">
                  {selectedUsers.size}
                </span>
              )}
            </div>
            {activeTab === 'users' && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600" />
            )}
          </button>
        </div>

        {/* Search & Content */}
        <div className="flex-1 flex flex-col min-h-0">
          {activeTab === 'departments' ? (
            <>
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Departman ara..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                    <Loader2 className="h-8 w-8 animate-spin mb-2 text-blue-600" />
                    <p>Departmanlar yükleniyor...</p>
                  </div>
                ) : error ? (
                  <div className="text-center py-8 text-red-500 bg-red-50 rounded-lg">
                    <p>{error}</p>
                    <button 
                      onClick={fetchDepartments}
                      className="mt-2 text-sm text-blue-600 hover:underline"
                    >
                      Tekrar Dene
                    </button>
                  </div>
                ) : (
                  renderTree(filteredDepartments)
                )}
              </div>
            </>
          ) : (
            <>
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <div className="relative flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Kullanıcı ara..."
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && searchUsers()}
                      className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={searchUsers}
                    disabled={userLoading || !userSearchTerm.trim()}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Ara
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {userLoading ? (
                  <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                    <Loader2 className="h-8 w-8 animate-spin mb-2 text-blue-600" />
                    <p>Aranıyor...</p>
                  </div>
                ) : userResults.length > 0 ? (
                  <div className="space-y-2">
                    {userResults.map(user => {
                      const isSelected = selectedUsers.has(user.username)
                      const departmentDisplay = user.department ? user.department.split('_').join(' > ') : ''
                      return (
                        <div
                          key={user.username}
                          onClick={() => toggleUserSelection(user.username)}
                          className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                            isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium ${
                              isSelected ? 'bg-blue-200 text-blue-700' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {user.name ? user.name.substring(0, 2).toUpperCase() : user.username.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{user.name || user.username}</p>
                              <p className="text-xs text-gray-500">{user.username}</p>
                              {departmentDisplay && (
                                <p className="text-xs text-gray-400 mt-0.5">{departmentDisplay}</p>
                              )}
                            </div>
                          </div>
                          {isSelected && <Check className="h-4 w-4 text-blue-600" />}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    {userSearchTerm ? 'Kullanıcı bulunamadı.' : 'Aramak için kullanıcı adı veya isim girin.'}
                  </div>
                )}
                
                {/* Selected Users Summary (if any, even if not in search results) */}
                {selectedUsers.size > 0 && userResults.length === 0 && (
                   <div className="mt-4 pt-4 border-t border-gray-100">
                     <p className="text-xs font-semibold text-gray-500 mb-2">Seçili Kullanıcılar ({selectedUsers.size})</p>
                     <div className="flex flex-wrap gap-2">
                       {Array.from(selectedUsers).map(username => (
                         <div key={username} className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-xs flex items-center gap-1">
                           {username}
                           <button 
                             onClick={(e) => {
                               e.stopPropagation()
                               toggleUserSelection(username)
                             }}
                             className="hover:bg-blue-100 rounded-full p-0.5"
                           >
                             <X className="h-3 w-3" />
                           </button>
                         </div>
                       ))}
                     </div>
                   </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex items-center justify-between bg-gray-50 rounded-b-lg">
          <div className="text-xs text-gray-500">
            {selectedIds.size} departman, {selectedUsers.size} kullanıcı seçildi
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              İptal
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}


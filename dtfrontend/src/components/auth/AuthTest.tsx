import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

export function AuthTest() {
  const [user, setUser] = useState<any>(null)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const response = await api.get('/users/login_jwt')
      setUser(response)
      setError('')
    } catch (err) {
      setUser(null)
      setError('Not authenticated')
    }
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Auth Status</h2>
      {user ? (
        <div className="text-green-600">
          <p>Authenticated as: {user.username}</p>
          <pre className="mt-2 bg-gray-100 p-2 rounded">
            {JSON.stringify(user, null, 2)}
          </pre>
        </div>
      ) : (
        <p className="text-red-600">{error || 'Checking authentication...'}</p>
      )}
    </div>
  )
}
